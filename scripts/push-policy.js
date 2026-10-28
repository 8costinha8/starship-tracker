/* Push policy (one place, used by sendPush for every feed: Road, news, mission, flight-checker).
   - Dedupe: ONE push per vehicle + event type + UK day, across all feeds (keyed on what the push says).
   - Milestones always push (unless deduped). Everything else is a minor update: silent in-app,
     except after a quiet stretch — if NO push of any kind went out in the last QUIET_WINDOW_HOURS,
     the single most significant minor update pushes (then the window resets, so at most 1 per stretch). */
const QUIET_WINDOW_HOURS = 24;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ukDay = (iso) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return "?"; const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", timeZone: "Europe/London" }).formatToParts(new Date(t)).map((x) => [x.type, x.value])); return `${Number(p.day)} ${MON[p.month - 1]}`; };

const HEDGE = /\b(ahead of|preparing|prepare|potential|could|may|might|expected|planned|soon|ready for|for (?:a |its |the )?(?:potential )?static|road closed?|closure|loading|begun|noted|activity|reportedly|possible)\b/i;
// Milestones: [type, regex, needs-no-hedge]
const MILESTONES = [
  ["flight_results", /\b(splash(?:ed)? ?down|landed|flight (?:\d+ )?(?:results?|success|was a success)|reached orbit|mission success)\b/i, true],
  ["catch", /\b(caught|catches (?:the )?(?:booster|ship)|catch (?:was )?successful|successful(?:ly)? catch)\b/i, true],
  ["launch", /\b(lift(?:s|ed)? ?off|launched|launches)\b/i, true],
  ["launch_date", /\b(NET \d|targeting (?:NET )?\d|launch date (?:set|moved|slips?|changed|now)|now targeting|launch (?:is )?(?:set|scheduled) for)\b/i, false],
  ["faa_licence", /\b(FAA (?:licen[cs]e|license) (?:issued|granted|approved|modified|modification approved)|licen[cs]e (?:issued|granted|approved)|FAA (?:issues|grants|approves))\b/i, true],
  ["wdr", /\b(wdr|wet dress)\b.*\b(complet\w*|conduct\w*|perform\w*|done|underway|begins?)\b|\b(complet\w*|conduct\w*)\b.*\b(wdr|wet dress)\b/i, true],
  ["stacking", /\b(full stack|fully stacked|stacked (?:on|atop) (?:booster|b\d+)|(?:ship|s\d+) (?:\w+ )?stacked|stacks? (?:ship|s\d+))\b/i, true],
  ["raptors_installed", /\b(all (?:\d+ )?(?:raptors?|engines?) (?:installed|in)|engines? in\b|raptors? installed|full set of (?:raptors?|engines?))\b/i, true],
  ["cryo_complete", /\b(complet\w* (?:its |a |the )?(?:further )?cryo|cryo\w* (?:test\w* )?(?:complete\w*|done|finished))\b/i, true],
  ["static_fire", /\bstatic[- ]?fir\w*\b/i, "sf"],
  ["rollout", /\b(rolls?|rolled|rolling|heads?|headed|heading|arrives?|arrived|moved|moves) (?:out )?(?:back )?to (?:the )?(?:launch site|pad|launch pad|orbital launch|olm|pad \d|pad-\d)\b|\brolls? out\b|\brolled out\b/i, false],
];
const SF_HEDGE = /\b(road closed?|closure|loading|begun|noted|activity|potential|could|may|might|expected|planned|ready for|ahead of (?:its |a |the )?(?:potential )?static|for (?:a |its |the )?(?:potential )?static)\b/i;
const SF_DONE = /\b(conduct\w*|complet\w*|perform\w*|fired|fires|lit up|lights up|ignit\w*|done|test fires?)\b/i;
const MINOR_RANK = { cryo_progress: 6, transport: 5, lift: 4, pad_work: 3, other: 1 };
function minorType(t) {
  if (/cryo/i.test(t)) return "cryo_progress";
  if (/\b(transport\w*|heads?|rolls?|moved?|moving|returns?|arrives?|departs?|transporter|stand)\b/i.test(t)) return "transport";
  if (/\b(lift\w*|lifted|lifting|catch height)\b/i.test(t)) return "lift";
  if (/\b(pad|trench|tower|mount|olm|bqd|deluge)\b/i.test(t)) return "pad_work";
  return "other";
}
function vehicleOf(text, vehicles = []) {
  const m = String(text).match(/\b(?:(?:Booster|B)\s*(\d{2,3})|(?:Ship|S)\s*(\d{2,3}))\b/i);
  if (m) return m[1] ? `B${m[1]}` : `S${m[2]}`;
  const cur = (vehicles || []).map(String);
  if (/\bbooster\b|super heavy/i.test(text)) return cur.find((v) => /^B/i.test(v)) || "booster";
  if (/\bship\b/i.test(text)) return cur.find((v) => /^S/i.test(v)) || "ship";
  const f = String(text).match(/\bflight (\d+)\b/i); if (f) return `F${f[1]}`;
  return "starship";
}
// n: { title, body, at }. Returns { vehicle, type, milestone, rank, date, key }
function classify(n, { vehicles = [] } = {}) {
  const t = `${n.body || ""}`; const title = n.title || "";
  const unconfirmed = /unconfirmed/i.test(title) || n.unconfirmed;
  let type = null;
  if (!unconfirmed) for (const [k, re, mode] of MILESTONES) {
    if (!re.test(t)) continue;
    if (mode === "sf") { if (SF_DONE.test(t) && !SF_HEDGE.test(t)) { type = k; break; } continue; }
    if (mode === true && HEDGE.test(t)) continue;
    type = k; break;
  }
  const milestone = !!type;
  if (!type) type = minorType(t);
  const vehicle = vehicleOf(t, vehicles);
  const date = ukDay(n.at || n.sent_at);
  return { vehicle, type, milestone, rank: milestone ? 100 : MINOR_RANK[type] || 1, date, key: `${vehicle}|${type}|${date}` };
}
const sentRows = (h) => (h || []).filter((r) => r && r.verdict === "sent");
// history: earlier log rows (notifications.json + this run). now: ms. Returns { push, reason, cls }
function decide(n, history, { now = Date.now(), vehicles = [] } = {}) {
  const cls = classify(n, { vehicles });
  const sent = sentRows(history);
  if (sent.some((r) => (r.key || classify(r, { vehicles }).key) === cls.key)) return { push: false, reason: `duplicate ${cls.key}`, cls };
  if (cls.milestone) return { push: true, reason: `milestone ${cls.type}`, cls };
  const last = Math.max(-Infinity, ...sent.map((r) => Date.parse(r.sent_at)).filter(Number.isFinite));
  const quietH = (now - last) / 3600000;
  if (quietH < QUIET_WINDOW_HOURS) return { push: false, reason: `minor ${cls.type} — a push went out ${quietH.toFixed(1)}h ago (quiet window ${QUIET_WINDOW_HOURS}h)`, cls };
  return { push: true, reason: `minor ${cls.type} after ${Number.isFinite(quietH) ? quietH.toFixed(1) + "h" : "no earlier"} quiet`, cls };
}
// Order a batch so milestones go first, then the single most significant minor (sendPush then keeps the rest silent).
function orderBatch(list, { vehicles = [] } = {}) {
  return [...list].map((n, i) => ({ n, i, r: classify(n, { vehicles }).rank })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.n);
}
module.exports = { QUIET_WINDOW_HOURS, classify, decide, orderBatch, vehicleOf };
