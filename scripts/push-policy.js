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
  ["launch_date", /\b(NET \d+|targeting (?:NET )?\d|launch date (?:set|moved|slips?|changed|now)|now targeting|launch (?:is )?(?:set|scheduled) for)\b/i, false],
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
// Launch-day milestones, read on title + body (11 Nov rehearsal D1/D2/D3/D5: flight-checker pushes carry the event in the TITLE,
// e.g. "🚧 Launch delayed" / "Now 14 Nov 22:45"). Generic for any flight. The older rules above stay body-only: category titles
// such as "💥 Static fires: In progress" must not turn routine card pushes into milestones.
const MONS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";
const SOFT_HEDGE = /\b(could|may|might|potential(?:ly)?|possible|possibly|reportedly|rumou?r\w*)\b/i;
const DATE_CHANGE = new RegExp(`\\b(launch (?:delayed|postponed|scrubbed|slips?|slipped|moved)|launch (?:time|date|window) (?:is )?confirmed|confirmed the (?:flight \\d+ )?launch (?:date|time|window)|scrub(?:bed|s)?|stand(?:s|ing)? down|stood down|slip(?:s|ped)? to|T-0 (?:is|now|set|moved)|launch window (?:opens|is set|set)|set the (?:flight \\d+ )?launch window|new (?:launch (?:date|time)|estimated (?:date|time)|T-0|NET))\\b`, "i");
// "moved to <date>": a date change (not transport) when the launch / flight is the subject
const MOVED_TO_DATE = new RegExp(`\\b(?:moved|moves|pushed|delayed|postponed|slipped|slips|shifted)\\b[^.]{0,30}?\\bto (?:NET )?\\d{1,2} (?:${MONS})`, "i");
const LAUNCH_SUBJECT = /\b(launch|flight \d+|T-0|NET)\b/i, NOT_LAUNCH_SUBJECT = /\b(static[- ]?fire|wdr|wet dress|cryo|roll ?out|rolled out|stack\w*)\b/i;
const LIFTOFF = /\b(lift ?off!|liftoff of|lifted off|lifts off|is in the air|has launched)/i, COUNTDOWN = /\b(?:lift ?off|launch) in \d+\s*(?:min|h)/i;
const RESULT = /🏁|\bflight \d+\s*[—–-]\s*(?:success|partial|failure)\b|\bflight \d+ (?:was a (?:success|failure|partial success)|ended in (?:success|failure))\b/i;
const LOSS = /\b(?:booster|ship|super heavy|B\d{2,3}|S\d{2,3})\b[^.]{0,40}?\b(?:was lost|lost|exploded|broke up|was destroyed|did not survive|didn't survive|RUD|rapid unscheduled disassembly)\b|\bloss of (?:the )?(?:booster|ship|vehicle|super heavy)\b|\b(?:catch|landing|reentry|splashdown) (?:attempt )?failed\b|\bfailed (?:the |its )?(?:catch|landing|reentry)\b/i;
const ROLLOVER = /^\W*Road to Flight \d+\s*$/i;
// "Flight 15 is now 14 Nov" / "Flight 15 now 14 Nov 22:45": a date change only when the flight / launch itself is the subject
const NOW_DATE = new RegExp(`\\b(?:flight \\d+|launch(?: date| time| window)?|T-0|liftoff)\\s+(?:is\\s+)?now\\s+(?:(?:NET|on|at|for|targeting|set for)\\s+)?(?:\\d{1,2} (?:${MONS})|(?:[01]?\\d|2[0-3]):[0-5]\\d)\\b`, "i");
// the pre-launch livestream reminder ("📡 Livestream ready" / "Liftoff in 60 min"): its own event type, so it never dedupes a real liftoff push
const LIVESTREAM_TITLE = /\b(?:livestream|webcast)\b/i;
// a loss is a milestone only for the current flight's vehicles, between liftoff and liftoff + LOSS_WINDOW_HOURS
const LOSS_WINDOW_HOURS = 3;
function launchDayType(title, body, { vehicles = [], liftoffAt = null, at = null } = {}) {
  const t = `${title} ${body}`;
  if (LOSS.test(t) && !HEDGE.test(body) && lossQualifies(t, { vehicles, liftoffAt, at })) return "vehicle_lost";
  if (RESULT.test(t)) return "flight_results";
  if (!SOFT_HEDGE.test(t) && (DATE_CHANGE.test(t) || NOW_DATE.test(t) || (MOVED_TO_DATE.test(t) && LAUNCH_SUBJECT.test(t) && !NOT_LAUNCH_SUBJECT.test(t)))) return "launch_date";
  if (LIFTOFF.test(t) && !COUNTDOWN.test(t) && !HEDGE.test(body)) return "launch";
  if (ROLLOVER.test(title)) return "rollover";
  return null;
}
// the loss must name a current-flight vehicle (explicit "Ship 42" / "B22", or plain "the booster" / "the ship" resolved to the
// current one) and every explicitly numbered vehicle in it must be current; and it must fall inside liftoff .. liftoff + 3h
function lossQualifies(t, { vehicles = [], liftoffAt = null, at = null } = {}) {
  const cur = new Set((vehicles || []).map((v) => String(v).toUpperCase()));
  if (!cur.size) return false;
  const named = [...String(t).matchAll(/\b(?:(?:Booster|B)\s*(\d{2,3})|(?:Ship|S)\s*(\d{2,3}))\b/gi)].map((m) => (m[1] ? `B${m[1]}` : `S${m[2]}`));
  if (named.some((v) => !cur.has(v))) return false;
  if (!cur.has(vehicleOf(t, vehicles).toUpperCase())) return false;
  const lo = Date.parse(liftoffAt), when = Date.parse(at);
  if (!Number.isFinite(lo) || !Number.isFinite(when)) return false;
  return when >= lo && when <= lo + LOSS_WINDOW_HOURS * 3600000;
}
// liftoff time from the history: the latest real liftoff push / card ("🚀 Liftoff!", "… lifted off …"), whatever its verdict (a deduped
// generic liftoff row is still evidence), not a retracted row, not a countdown / livestream reminder
function liftoffFrom(history, now = Infinity) {
  let best = null;
  for (const r of history || []) {
    if (!r || r.retracted) continue;
    const tt = `${r.title || ""} ${r.body || ""}`;
    if (!LIFTOFF.test(tt) || COUNTDOWN.test(tt) || HEDGE.test(r.body || "") || /unconfirmed/i.test(r.title || "")) continue;
    const ts = Date.parse(r.sent_at || r.at);
    if (Number.isFinite(ts) && ts <= now && (best === null || ts > best)) best = ts;
  }
  return best === null ? null : new Date(best).toISOString();
}
// The launch date / time a launch_date push names ("14 Nov 22:45", "12 Nov"); attribution "(SpaceX, 14 Nov)" ignored.
function launchTarget(text) {
  const t = String(text).replace(/\([^()]*\)/g, " ");
  const d = t.match(new RegExp(`\\b(\\d{1,2}) (${MONS})[a-z]*\\b`, "i")), h = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (!d) return null;
  return `${Number(d[1])} ${d[2][0].toUpperCase()}${d[2].slice(1, 3).toLowerCase()}${h ? ` ${h[1].padStart(2, "0")}:${h[2]}` : ""}`;
}
const isConfirmed = (t) => !/\b(unconfirmed|unofficial)\b/i.test(t) && /\b(confirm\w*|official)\b|\bset the (?:flight \d+ )?launch window\b|\blaunch window opens\b/i.test(t);
// n: { title, body, at }. Returns { vehicle, type, milestone, rank, date, key } (+ target / confirmed for launch_date)
// liftoffAt (optional): ISO time of this flight's liftoff (decide() reads it from the history); a loss outside liftoff .. +3h is not vehicle_lost
function classify(n, { vehicles = [], liftoffAt = null, now = null } = {}) {
  const t = `${n.body || ""}`; const title = n.title || "";
  const unconfirmed = /unconfirmed/i.test(title) || n.unconfirmed;
  let type = null;
  if (!unconfirmed) {
    const when = n.at || n.sent_at || (Number.isFinite(now) ? new Date(now).toISOString() : null);
    const ld = launchDayType(title, t, { vehicles, liftoffAt, at: when });
    if (ld === "vehicle_lost") type = ld; // before "launch" / "catch": "Ship 42 was lost after liftoff"
    if (!type && LIVESTREAM_TITLE.test(title) && COUNTDOWN.test(`${title} ${t}`)) type = "livestream"; // milestone, as before, but its own key
    if (!type) for (const [k, re, mode] of MILESTONES) {
      if (!re.test(t)) continue;
      if (mode === "sf") { if (SF_DONE.test(t) && !SF_HEDGE.test(t)) { type = k; break; } continue; }
      if (mode === true && HEDGE.test(t)) continue;
      type = k; break;
    }
    if (!type && ld) type = ld;
  }
  const milestone = !!type;
  if (!type) type = minorType(t);
  let vehicle = vehicleOf(t, vehicles);
  const date = ukDay(n.at || n.sent_at);
  const out = { vehicle, type, milestone, rank: milestone ? 100 : MINOR_RANK[type] || 1, date, key: `${vehicle}|${type}|${date}` };
  if (type === "launch_date") { // one push per new launch date / time, whichever feed (flight checker, Road card, news) says it first
    const tt = `${title} ${t}`; out.target = launchTarget(t) || launchTarget(title); out.confirmed = isConfirmed(tt);
    out.vehicle = "flight"; out.key = `flight|launch_date${out.target ? "@" + out.target : ""}|${date}`;
  }
  return out;
}
const sentRows = (h) => (h || []).filter((r) => r && r.verdict === "sent");
// a silent backfill leaves a dedupe_only row: it blocks a later push of the same vehicle|event|date, but is not a push (quiet window ignores it)
const dedupeRows = (h) => (h || []).filter((r) => r && !r.retracted && (r.verdict === "sent" || r.dedupe_only === true)); // retracted: a stale / wrong push fixed by hand, not an event
// history: earlier log rows (notifications.json + this run). now: ms. Returns { push, reason, cls }
// big: SpaceX / Elon Flight N milestone or a correction (push-gate.js) → skips the quiet window (dedupe still applies)
function decide(n, history, { now = Date.now(), vehicles = [], big = false } = {}) {
  const cls = classify(n, { vehicles, liftoffAt: liftoffFrom(history, now), now });
  const sent = sentRows(history);
  const dup = dedupeRows(history).find((r) => (r.key || classify(r, { vehicles }).key) === cls.key);
  if (dup && !big) return { push: false, reason: dup.dedupe_only ? `already on the card (silent backfill ${cls.key}) — not a new event` : `duplicate ${cls.key}`, cls };
  if (dup && big && dup.verdict === "sent" && !/^Correction/.test(n.title || "")) return { push: false, reason: `duplicate ${cls.key}`, cls };
  // a launch_date push that only repeats the last date / time already pushed (no confirmation upgrade) is not a new event
  if (cls.milestone && cls.type === "launch_date" && cls.target) {
    const prev = sent.map((r) => classify(r, { vehicles })).filter((c) => c.type === "launch_date" && c.target).pop();
    if (prev && prev.target === cls.target && !(cls.confirmed && !prev.confirmed)) return { push: false, reason: `launch date ${cls.target} already pushed — not a new event`, cls };
  }
  if (cls.milestone) return { push: true, reason: `milestone ${cls.type}`, cls };
  if (big) return { push: true, reason: `big news / correction (skips the ${QUIET_WINDOW_HOURS}h quiet window)`, cls };
  const last = Math.max(-Infinity, ...sent.map((r) => Date.parse(r.sent_at)).filter(Number.isFinite));
  const quietH = (now - last) / 3600000;
  if (quietH < QUIET_WINDOW_HOURS) return { push: false, reason: `minor ${cls.type} — a push went out ${quietH.toFixed(1)}h ago (quiet window ${QUIET_WINDOW_HOURS}h)`, cls };
  return { push: true, reason: `minor ${cls.type} after ${Number.isFinite(quietH) ? quietH.toFixed(1) + "h" : "no earlier"} quiet`, cls };
}
// Order a batch so milestones go first, then the single most significant minor (sendPush then keeps the rest silent).
function orderBatch(list, { vehicles = [] } = {}) {
  // same rank: a dedicated push ("🚀 Liftoff!") goes before a generic one ("Flight N update" / "🚀 Starship"), so for one event the dedicated one is sent and the generic is deduped
  const generic = (n) => (/^\s*(?:Flight \d+ update|🚀 Starship)\s*$/i.test(n.title || "") ? 1 : 0);
  return [...list].map((n, i) => ({ n, i, r: classify(n, { vehicles }).rank, g: generic(n) })).sort((a, b) => b.r - a.r || a.g - b.g || a.i - b.i).map((x) => x.n);
}
module.exports = { QUIET_WINDOW_HOURS, LOSS_WINDOW_HOURS, classify, decide, orderBatch, vehicleOf, launchTarget, liftoffFrom };
