// /docs/js/workflow.js


export const POWER_STATES = {
  not_checked: "NOT CHECKED",
  bgas_awaiting_meter_type: "BGAS - AWAITING METER TYPE",
  bgas_meter_exchange_appointment: "BGAS - METER EXCHANGE APPOINTMENT",
  e10: "E10",
  appointment_fault_exchange: "APPOINTMENT FOR FAULT/EXHANGE",
  power_ready: "POWER READY"
};


export function buildTaskSeed(propertyRow) {
  const r = propertyRow;
  const tasks = [];

  // Always
  tasks.push({ key: "paperwork_pos", name: "Paperwork & PO’s", requires_power: false });
  tasks.push({ key: "bgas_check", name: "Check if property is on BGAS", requires_power: false });

  // No power required
  if (r.asbestos_survey) tasks.push({ key: "asbestos_survey", name: "Asbestos Survey", requires_power: false });
  if (r.rot_works) tasks.push({ key: "rot_survey_request", name: "Rot Works Survey Request", requires_power: false });
  if (r.kitchen_renewal) tasks.push({ key: "kitchen_drawing_request", name: "Kitchen Renewal Drawing Request", requires_power: false });

  // Power required
  if (r.asbestos_removal) tasks.push({ key: "asbestos_removal", name: "Asbestos Removal", requires_power: true });
  if (r.heating_referral) tasks.push({ key: "heating", name: "Heating Referral / Works", requires_power: true });
  if (r.kitchen_renewal) tasks.push({ key: "kitchen_works", name: "Kitchen Renewal Works", requires_power: true });
  if (r.epc) tasks.push({ key: "epc_eicr", name: "EPC / EICR Final Stage", requires_power: true });

  // Optional add-ons from checklist
  if (r.glazier) tasks.push({ key: "glazier", name: "Glazier", requires_power: false });
  if (r.altro_flooring) tasks.push({ key: "altro", name: "Altro Flooring", requires_power: true });
  if (r.bathroom_renewal) tasks.push({ key: "bathroom", name: "Bathroom Renewal", requires_power: true });
  if (r.paint_lines) tasks.push({ key: "paint_lines", name: "Paint Lines", requires_power: false });
  if (r.isolator_required) tasks.push({ key: "isolator", name: "Isolator Required", requires_power: true });

  return tasks;
}

export function applyRules(tasks, powerStatus) {
  const powerReady = powerStatus === "power_ready";

  // EPC/EICR should be last: block unless other tasks complete + power ready
  const allOtherComplete = tasks
    .filter(t => t.key !== "epc_eicr")
    .every(t => t.status === "complete");

  for (const t of tasks) {
    if (t.status === "complete") { t.blocked_reason = null; continue; }

    if (t.requires_power && !powerReady) {
      t.status = "blocked";
      t.blocked_reason = "Power not ready";
      continue;
    }

    if (t.key === "epc_eicr" && (!powerReady || !allOtherComplete)) {
      t.status = "blocked";
      t.blocked_reason = !powerReady ? "Power not ready" : "Complete other required tasks first";
      continue;
    }

    if (t.status === "blocked") t.status = "not_started";
    t.blocked_reason = null;
  }

  return tasks;
}

export function nextActions(tasks, powerStatus) {
  const actions = [];
  actions.push("1) Paperwork & PO’s");
  actions.push("2) Check BGAS / Power status");

  const powerReady = powerStatus === "power_ready" || powerStatus === "e10_supply_taken_over";

  const open = tasks.filter(t => t.status !== "complete" && t.status !== "blocked");
  open.sort((a, b) => (a.requires_power === b.requires_power) ? 0 : (a.requires_power ? 1 : -1));

  open.slice(0, 8).forEach(t => actions.push(`• ${t.name}`));

  if (!powerReady) actions.push("Tip: while power is not ready, do surveys/drawings that don’t require power.");

  return actions;
}
``
