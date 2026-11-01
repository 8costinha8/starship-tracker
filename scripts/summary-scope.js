/* A flight's category summaries (latest / log_latest) come only from that flight's own vehicles.
   1 Nov: an untagged "Ship 43 back at Megabay 2." (Flight 16 hardware) became Flight 15's Pad summary.
   inScope(road, entry) → true when the entry may set a summary of road.flight. Pure, no network. */
const VEH = /\b(?:Booster\s*|B)(\d{1,3})\b|\b(?:Ship\s*|S)(\d{1,3})\b/gi;
function named(t) { const out = new Set(); String(t || "").replace(VEH, (_, b, s) => { out.add(b ? "B" + b : "S" + s); return _; }); return [...out]; }
function hwKey(hw) { const m = String(hw || "").match(/^\s*(?:Booster\s*|B)(\d+)|^\s*(?:Ship\s*|S)(\d+)/i); return m ? (m[1] ? "B" + m[1] : "S" + m[2]) : null; }
function inScope(road, entry) {
  if (!entry) return false;
  if (Number.isInteger(entry.flight) && Number.isInteger(road.flight) && entry.flight !== road.flight) return false;
  const mine = new Set(road.vehicles || []);
  if (!mine.size) return true;
  const vs = new Set(named([entry.text, entry.log_text, entry.status_line].filter(Boolean).join(" ")));
  const hk = hwKey(entry.hardware || (entry.milestone && entry.milestone.hardware)); if (hk) vs.add(hk);
  return [...vs].every((v) => mine.has(v)); // no vehicle named (pad work) is fine
}
module.exports = { inScope, named };
