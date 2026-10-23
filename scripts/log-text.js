/* Flight Log lines ("log_text"): one short plain sentence per entry, vehicle + action + place.
   Shared by check-road.js / x-first.js (writing) and the tests (style lint). The app mirrors
   logDay() and rollupStatus() in app.js. */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };
const SOURCE_NAMES = /\b(NSF|NASA ?Spaceflight|Spaceflight Now|SpaceNews|Teslarati|Launch Library|LL2|Next Spaceflight)\b/i;

// Style errors for one log line ([] = fine).
function lintLogText(s) {
  const t = String(s || ""), e = [];
  if (!t.trim()) return ["empty"];
  if (t.length > 110) e.push("too long");
  if (!/^[A-Z0-9]/.test(t)) e.push("must start with a capital");
  if (!/[.]$/.test(t)) e.push("must end with a full stop");
  if (/[.!?]\s+\S/.test(t.slice(0, -1).replace(/\b(?:St|No|approx)\./g, ""))) e.push("more than one sentence");
  if (/\bit's\b/i.test(t)) e.push("'it's' (use 'its')");
  if (/\b(\w+)\s+\1\b/i.test(t)) e.push("doubled word");
  if (/\bis been\b/i.test(t)) e.push("'is been'");
  if (/'s\s+(completes|completed|complete)\b/i.test(t)) e.push("possessive before 'completes'");
  if (/\bhas been transported\b|\bhas been moved\b/i.test(t)) e.push("filler wording");
  if (/\b(finished|wrapped up|concluded|completion of)\b/i.test(t)) e.push("completion lines use 'completed' or 'completes'");
  if (/\b\d{1,2}:\d{2}\b|\bUK\b|\bUTC\b/.test(t)) e.push("clock time");
  if (/@\w|https?:\/\/|#\w/.test(t)) e.push("handle, link or hashtag");
  if (SOURCE_NAMES.test(t)) e.push("public source name");
  if (/\b(satellite|starlink|payload)/i.test(t) && /\breleas/i.test(t)) e.push("satellites are 'deployed'");
  if (/\b(tier|rumou?r|confirmed by|reported by)\b/i.test(t)) e.push("tier/source label");
  return e;
}
// A writer's log line, tidied; null when it breaks the style (callers fall back).
function cleanLogText(s) {
  if (!s) return null;
  let t = String(s).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/^["'“]|["'”]$/g, "");
  t = t.replace(/\bit's\b/g, "its").replace(/\bIt's\b/g, "Its").replace(/\b(\w+)\s+\1\b/gi, "$1").replace(/\bis been\b/gi, "has been").replace(/'s\s+(completes|completed)\b/gi, " $1");
  t = t.replace(/\breleas(e|ed|es|ing)\b/gi, (m, x) => (/(satellite|starlink|payload)/i.test(t) ? { e: "deploy", ed: "deployed", es: "deploys", ing: "deploying" }[x.toLowerCase()] : m));
  t = t.replace(/[.\s]+$/, "") + ".";
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return lintLogText(t).length ? null : t;
}
// One single day for the Flight Log: explicit log_date, else the entry's own day (a range → its first day), else the time's UK day.
function logDay(h) {
  if (!h) return "";
  if (h.log_date) return h.log_date;
  const m = String(h.date || "").match(/(\d{1,2})\s*(?:[–-]\s*\d{1,2}\s*)?([A-Z][a-z]{2})/);
  if (m) return `${Number(m[1])} ${m[2]}`;
  const iso = h.publishedAt || h.at;
  return iso && Number.isFinite(Date.parse(iso)) ? ukDay(iso) : "";
}
const hwOf = (h) => { const raw = (h.milestone && h.milestone.hardware) || h.hardware || ""; const m = String(raw).match(/^\s*(?:Ship\s*|S)(\d+)|^\s*(?:Booster\s*|B)(\d+)/i); return m ? (m[1] ? "S" + m[1] : "B" + m[2]) : null; };
const ROLLUP_SECTIONS = ["cryo", "raptor", "static"]; // per-vehicle test sections (pad work, FAA and the date never roll up)
// Section status from its entries: every current-flight vehicle has a completed entry and none is open → "done".
function rollupStatus(c, road) {
  if (!c || !ROLLUP_SECTIONS.includes(c.id)) return c && c.status;
  const vs = (road.vehicles || []).map((v) => String(v).toUpperCase());
  const own = (c.history || []).filter((h) => h && h.kind !== "check" && !(h.flight > road.flight) && h.trust !== "unconfirmed" && hwOf(h));
  if (!vs.length || !own.length) return c.status;
  const done = (h) => (h.milestone && h.milestone.phase === "completed") || h.complete === true;
  const latestPer = {};
  for (const h of own) if (!latestPer[hwOf(h)]) latestPer[hwOf(h)] = h; // history is newest first
  return vs.every((v) => latestPer[v] && done(latestPer[v])) && Object.values(latestPer).every(done) ? "done" : c.status;
}
const hasVehicleEntries = (c, road) => !!c && ROLLUP_SECTIONS.includes(c.id) && (road.vehicles || []).length > 0 && (c.history || []).some((h) => h && h.kind !== "check" && !(h.flight > road.flight) && h.trust !== "unconfirmed" && hwOf(h));
// The section's Flight Log headline: the newest current-flight trusted entry's log line.
function sectionLatest(c, road) {
  const h = (c.history || []).find((x) => x && x.kind !== "check" && !(x.flight > road.flight) && x.trust !== "unconfirmed" && x.log_text);
  return h ? h.log_text : c.log_latest || null;
}
module.exports = { lintLogText, cleanLogText, logDay, rollupStatus, hasVehicleEntries, sectionLatest, hwOf, ukDay };
