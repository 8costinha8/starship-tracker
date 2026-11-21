/* B3 (outage fallback) — checker side. See app.js flightFromCheckerFile for the reader. */
// B3: the snapshot the app falls back to when Launch Library fails and the visitor has nothing cached.
// { n, net, precision, status (LL2 abbrev), window_start, window_end, pad, vehicles, updatedAt } — only what LL2 / road.json said, never invented.
// Rewritten when a material field changed, or when the file is older than HEARTBEAT_MS (so it is never older than the app's 6 h limit).
const HEARTBEAT_MS = 3 * 3600000;
function snapshotOf(pick, road, nowMs) {
  if (!pick || !pick.launch || !Number.isInteger(pick.n)) return null;
  const l = pick.launch, sameRoad = road && Number(road.flight) === pick.n;
  return { n: pick.n, net: l.net || null, precision: (l.net_precision && l.net_precision.abbrev) || "", status: (l.status && l.status.abbrev) || "",
    window_start: l.window_start || null, window_end: l.window_end || null, pad: (sameRoad && typeof road.pad === "string" && road.pad) || null,
    vehicles: (sameRoad && Array.isArray(road.vehicles) ? road.vehicles : []).map(String), updatedAt: new Date(nowMs).toISOString() };
}
const material = (x) => JSON.stringify([x.n, x.net, x.precision, x.status, x.window_start, x.window_end, x.pad, x.vehicles]);
function needsWrite(prev, next, nowMs) {
  if (!next) return false; if (!prev) return true;
  return material(prev) !== material(next) || !(nowMs - Date.parse(prev.updatedAt) < HEARTBEAT_MS);
}
module.exports = { snapshotOf, needsWrite, HEARTBEAT_MS };
