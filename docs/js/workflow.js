// /docs/js/workflow.js

export const POWER_STATES = {
  not_checked: "NOT CHECKED",
  bgas_awaiting_meter_type: "BGAS - AWAITING METER TYPE",
  bgas_meter_exchange_appointment: "BGAS - METER EXCHANGE APPOINTMENT",
  e10: "E10",
  appointment_fault_exchange: "APPOINTMENT FOR FAULT/EXHANGE",
  power_ready: "POWER READY"
};

/**
 * Build the task seed for a property.
 * NOTE: "Glazier" and "Paint Lines" are included inside "Paperwork & PO’s"
 * so they are intentionally NOT separate tasks anymore.
 */
export function buildTaskSeed(propertyRow) {
  const r = propertyRow;
  const tasks = [];

  // Always (top of workflow)
  tasks.push({ key: "paperwork_pos", name: "Paperwork & PO’s", requires_power: false, status: "not_started" });
  tasks.push({ key: "bgas_check", name: "Check if property is on BGAS", requires_power: false, status: "not_started" });

  // No power required (optional)
  if (r.asbestos_survey) {
    tasks.push({ key: "asbestos_survey", name: "Asbestos Survey", requires_power: false, status: "not_started" });
  }
  if (r.rot_works) {
    tasks.push({ key: "rot_survey_request", name: "Rot Works Survey Request", requires_power: false, status: "not_started" });
  }
  if (r.kitchen_renewal) {
    tasks.push({ key: "kitchen_drawing_request", name: "Kitchen Renewal Drawing Request", requires_power: false, status: "not_started" });
  }

  // Power required (optional)
  if (r.isolator_required) {
    tasks.push({ key: "isolator", name: "Isolator Required", requires_power: true, status: "not_started" });
  }
  if (r.altro_flooring) {
    tasks.push({ key: "altro", name: "Altro Flooring", requires_power: true, status: "not_started" });
  }
  if (r.asbestos_removal) {
    tasks.push({ key: "asbestos_removal", name: "Asbestos Removal", requires_power: true, status: "not_started" });
  }
  if (r.heating_referral) {
    tasks.push({ key: "heating", name: "Heating Referral / Works", requires_power: true, status: "not_started" });
  }

  // Other optional add-ons (kept, but not part of the strict workflow order unless you add them)
  if (r.kitchen_renewal) {
    tasks.push({ key: "kitchen_works", name: "Kitchen Renewal Works", requires_power: true, status: "not_started" });
  }
  if (r.bathroom_renewal) {
    tasks.push({ key: "bathroom", name: "Bathroom Renewal", requires_power: true, status: "not_started" });
  }

  // Final stage (must be last)
  if (r.epc) {
    tasks.push({ key: "epc_eicr", name: "EPC / EICR Final Stage", requires_power: true, status: "not_started" });
  }

  // ✅ Removed standalone tasks:
  // - Glazier
  // - Paint Lines

  return tasks;
}

/**
 * Apply workflow rules:
 * - Power required tasks are blocked if power is not ready
 * - "epc_eicr" must be last: blocked unless ALL other tasks are complete AND power ready
 * - Main workflow order enforced, but optional-aware (skips missing tasks)
 * - Parallel groups:
 *   - asbestos_survey + isolator can run together
 *   - altro + asbestos_removal can run together
 */
export function applyRules(tasks, powerStatus) {
  const powerReady = powerStatus === "power_ready";

  // Your desired workflow order (optional tasks will be skipped if they don't exist)
  const WORKFLOW_ORDER = [
    "paperwork_pos",
    "bgas_check",
    "asbestos_survey",
    "isolator",
    "altro",
    "asbestos_removal",
    "heating",
    "epc_eicr"
  ];

  // Tasks within these groups can be done in any order and won't block each other.
  const PARALLEL_GROUPS = [
    ["asbestos_survey", "isolator"],
    ["altro", "asbestos_removal"]
  ];

  const existingKeys = new Set(tasks.map(t => t.key));
  const byKey = new Map(tasks.map(t => [t.key, t]));

  const isComplete = (k) => byKey.get(k)?.status === "complete";

  const inSameParallelGroup = (a, b) =>
    PARALLEL_GROUPS.some(group => group.includes(a) && group.includes(b));

  /**
   * Build a requirement list for a task, only using tasks that exist for this property.
   * - If a prior step doesn't exist, it's skipped (optional-aware).
   * - If prior step is in the same parallel group as current, it is NOT required.
   * - If prior step belongs to a parallel group, require "anyOf" that group to be complete
   *   (only among group members that exist and are positioned before the current task).
   */
  const requiredBefore = (taskKey) => {
    const idx = WORKFLOW_ORDER.indexOf(taskKey);
    if (idx === -1) return []; // not controlled by workflow order

    const req = [];

    for (let i = 0; i < idx; i++) {
      const prevKey = WORKFLOW_ORDER[i];

      // Skip if not present for this property
      if (!existingKeys.has(prevKey)) continue;

      // If prev is parallel with current, don't require it
      if (inSameParallelGroup(prevKey, taskKey)) continue;

      // If prev is in a parallel group, require at least one of that group's members (that exist) be complete
      const prevGroup = PARALLEL_GROUPS.find(g => g.includes(prevKey));
      if (prevGroup) {
        const groupMembersBefore = prevGroup.filter(k => {
          if (!existingKeys.has(k)) return false;
          if (WORKFLOW_ORDER.indexOf(k) >= idx) return false;
          if (inSameParallelGroup(k, taskKey)) return false;
          return true;
        });

        if (groupMembersBefore.length > 0) {
          req.push({ type: "anyOf", keys: groupMembersBefore });
        }

        // Do not also add individual members separately
        continue;
      }

      // Standard requirement
      req.push({ type: "single", key: prevKey });
    }

    // De-dupe identical anyOf entries
    const seen = new Set();
    const deduped = [];
    for (const r of req) {
      if (r.type === "anyOf") {
        const sig = r.keys.slice().sort().join("|");
        if (seen.has(sig)) continue;
        seen.add(sig);
      }
      deduped.push(r);
    }

    return deduped;
  };

  const workflowAllowed = (taskKey) => {
    const requirements = requiredBefore(taskKey);
    for (const r of requirements) {
      if (r.type === "single") {
        if (!isComplete(r.key)) return { ok: false, reason: "Complete earlier workflow stage first" };
      } else if (r.type === "anyOf") {
        const anyDone = r.keys.some(k => isComplete(k));
        if (!anyDone) return { ok: false, reason: "Complete earlier workflow stage first" };
      }
    }
    return { ok: true, reason: null };
  };

  // EPC/EICR should be last: block unless all other tasks complete + power ready
  const allOtherComplete = tasks
    .filter(t => t.key !== "epc_eicr")
    .every(t => t.status === "complete");

  for (const t of tasks) {
    // Completed tasks are never blocked
    if (t.status === "complete") {
      t.blocked_reason = null;
      continue;
    }

    // Power gate
    if (t.requires_power && !powerReady) {
      t.status = "blocked";
      t.blocked_reason = "Power not ready";
      continue;
    }

    // Final stage gate (keep your existing key epc_eicr)
    if (t.key === "epc_eicr" && (!powerReady || !allOtherComplete)) {
      t.status = "blocked";
      t.blocked_reason = !powerReady ? "Power not ready" : "Complete other required tasks first";
      continue;
    }

    // Workflow gate (optional-aware)
    const gate = workflowAllowed(t.key);
    if (!gate.ok) {
      t.status = "blocked";
      t.blocked_reason = gate.reason;
      continue;
    }

    // If task was blocked and now allowed, reopen it
    if (t.status === "blocked") t.status = "not_started";
    t.blocked_reason = null;
  }

  return tasks;
}

/**
 * Next actions list:
 * - Shows open (not complete, not blocked) tasks
 * - Sorted by the workflow order
 * - Tasks not in the workflow order appear after the main ordered tasks
 */
export function nextActions(tasks, powerStatus) {
  const actions = [];
  const powerReady = powerStatus === "power_ready";

  const WORKFLOW_ORDER = [
    "paperwork_pos",
    "bgas_check",
    "asbestos_survey",
    "isolator",
    "altro",
    "asbestos_removal",
    "heating",
    "epc_eicr"
  ];

  const orderIndex = (t) => {
    const idx = WORKFLOW_ORDER.indexOf(t.key);
    return idx === -1 ? 999 : idx;
  };

  const isOpen = (t) => t.status !== "complete" && t.status !== "blocked";
  const open = tasks.filter(isOpen);

  // Strict workflow sort; unknown tasks go to the end
  open.sort((a, b) => orderIndex(a) - orderIndex(b));

  // Top items
  open.slice(0, 10).forEach(t => actions.push(`• ${t.name}`));

  // If everything is complete
  const remaining = tasks.filter(t => t.status !== "complete");
  if (remaining.length === 0) actions.unshift("All tasks complete ✅");

  // Optional hint if power isn't ready and there are power-required tasks outstanding
  if (!powerReady) {
    const powerOutstanding = tasks.some(t => t.requires_power && t.status !== "complete");
    if (powerOutstanding) actions.push("• Await power ready (required for some tasks)");
  }

  return actions;
}
