// Temporary local "database" for the shell site (browser-only).
// Later we swap this out for Supabase without changing the pages much.
const STORAGE_KEY = "inspection_app_properties_v1";

export function loadProperties() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

export function saveProperties(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function addProperty(property) {
  const list = loadProperties();
  list.push(property);
  saveProperties(list);
}

export function getPropertyById(id) {
  return loadProperties().find(p => p.id === id);
}

export function makeId() {
  return "PROP-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// Very simple “workflow suggestion” placeholder (we’ll make it smart later).
export function computeNextActions(property) {
  const actions = [];

  actions.push("Paperwork & PO’s (always first)");
  actions.push("Check if property is on BGAS (always second)");

  const powerReady = (property.powerStatus === "power_ready");
  const noPower = [
    "Asbestos Survey",
    "Rot Works Survey Request",
    "Kitchen Renewal Drawing Request",
  ];

  const powerRequired = [
    "Asbestos Removal",
    "Heating Referral/Works",
    "Kitchen Renewal (works)",
    "EPC / EICR Final Stage",
  ];

  actions.push(powerReady
    ? "Power is ready — proceed with power-dependent works"
    : "Power not ready — do non-power tasks first");

  if (!powerReady) actions.push(...noPower.map(x => `✅ (No power) ${x}`));
  if (powerReady) actions.push(...powerRequired.map(x => `✅ (Power required) ${x}`));

  return actions;
}
