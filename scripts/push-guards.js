/* Push guards (batch 1 / P1 "no wrong or duplicate alerts"). Pure: no I/O, no network, no sending.
   Sits in push-sync.sendPush BEFORE the push policy. A guard can only turn a push into an in-app-only item
   (the Updates feed / Road card keep it); it never deletes anything and never touches internal launch-critical
   pushes (liftoff, date / time change, T-60 livestream, deorbit, ship caught, flight result, Road to Flight N: those
   have no X post url and are only checked for an exact repeat).
   Rules (id → what it stops, audit case from the 22 Nov review of the last 10 pushes):
     G1  same source post / same text already pushed (72 h), or same vehicle + event within 15 min  (idempotency; unconfirmed → confirmed is an upgrade)
     G2  recap of a finished flight: names an older flight only, "last week / yesterday / 15th flight", or the post is > 6 h old   (#5 #8 #9)
     G3  an X post that claims a launch / catch / flight result while no liftoff of the CURRENT flight was pushed in 72 h   (#5 #8)
     G4  hardware that is not on the current flight (Ship 44, Booster 25 …)  (#7 #10)
     G5  a plan claim ("plans to / will …") that the source text does not contain   (#4)
     (during a flight, 48 h after its liftoff push, G6 and G7 are off: in-flight updates always go)
     G6  a minor update between 23:00 and 07:00 UK (held for the app)   (#6)
     G7  a non-milestone post (opinion / progress) that is not about the current flight, even from a big account   (#3 #6 #9)
   PUSH_GUARDS=warn (default, first week from 22 Nov 2026 per Bernardo: decide + log row.guard, never silence; switch the default to "on" after review ~29 Nov) | on (enforce G1 G2 G3 G5) | strict | off. */
const pp = require("./push-policy.js");
const H = 3600000;
const mode = () => String(process.env.PUSH_GUARDS || "warn").toLowerCase();
const text = (n) => `${n.title || ""} ${n.body || ""}`;
const ukHour = (t) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(new Date(t)));
const isX = (n) => /^https?:\/\/(?:x|twitter)\.com\//i.test(String(n.url || ""));
const statusId = (u) => (String(u || "").match(/status\/(\d{6,})/) || [])[1] || "";
const flightsIn = (t) => [...String(t).matchAll(/\b(?:flight\s*(\d{1,3})|(\d{1,3})(?:st|nd|rd|th)\s+(?:starship\s+)?flight)\b/gi)].map((m) => +(m[1] || m[2]));
const vehiclesIn = (t) => [...String(t).matchAll(/\b(?:(?:Booster|B)\s*(\d{2,3})|(?:Ship|S)\s*(\d{2,3}))\b/g)].map((m) => (m[1] ? `B${m[1]}` : `S${m[2]}`));
const RECAP = pp.RECAP_LEX; // shared with scope.js / push-policy.js; "yesterday" is deliberately NOT a recap word (a day-old report is still news; the date is kept instead)
const PLAN = /\b(plans?|planning|will|going to|to (?:catch|launch|fly|reuse|reflow)|aims?|intends?)\b/i;
// A plan is supported by the source if the source itself says plan/future wording, or ties the claim to an upcoming flight ("catch both on Flight 16", "next flight", "targeting").
const PLAN_SUPPORT = /\b(plans?|planning|will|going to|aims?|intends?|flight\s*\d+|next|upcoming|soon|target\w*|NET|ahead of|expected)\b/i;
const OUTCOME_TYPES = new Set(["flight_results", "catch", "launch"]);
const sentLike = (r) => /^(sent|shadow: would push)/.test(String(r.verdict || ""));
const CRITICAL_TITLE = /^(?:\W*(?:Road to Flight \d+|Liftoff|Launch (?:delayed|time confirmed)|New estimated (?:date|time)|Livestream ready|Ship caught|Booster caught)(?![A-Za-z])|\W*Flight \d+ — |\W*Deorbit in)/i;

function evaluate(n, { history = [], now = Date.now(), road = {}, vehicles, flight, sourceText } = {}) {
  const m = mode();
  const flightN = Number.isInteger(flight) ? flight : road.flight;
  const cur = (vehicles || road.vehicles || []).map(String);
  const t = text(n), src = String(sourceText || n.source_text || ""), both = `${t} ${src}`;
  // enforced: G1 G2 G3 G5 (clearly wrong or duplicate). advisory (annotated on the log row, never silenced unless PUSH_GUARDS=strict): G2b G4 G6 G7 (relevance / taste calls for Bernardo)
  const ENFORCED = new Set(["G1", "G2", "G3", "G5"]);
  const out = (rule, reason) => (m === "off" ? { action: "allow", mode: m } : { action: m === "warn" || (!ENFORCED.has(rule) && m !== "strict") ? "allow" : "silent", would: "silent", rule, reason, mode: m, advisory: !ENFORCED.has(rule) });
  const allow = { action: "allow", mode: m };
  const adv = [];
  // hit(): a silencing rule returns at once; an advisory / warn-mode one is remembered (first wins) and evaluation goes on
  const hit = (rule, reason) => { const r = out(rule, reason); if (r.action === "silent") return r; adv.push(r); return null; };
  const sent = (history || []).filter(sentLike);
  const at = Date.parse(n.at), nowT = now;

  // G1 — idempotency (applies to everything, internal pushes included: exact repeats only)
  const sid = statusId(n.url || n.source_url);
  const upgrade = (prev) => /unconfirmed/i.test(prev.title || "") && !/unconfirmed/i.test(n.title || "");
  for (const r of sent) {
    const age = nowT - Date.parse(r.sent_at || r.at);
    if (!(age >= 0)) continue;
    if (sid && statusId(r.url || r.source_url) === sid && age < 72 * H && !upgrade(r)) return out("G1", `source post ${sid} already pushed ${(age / H).toFixed(1)}h ago`);
    if (r.title === n.title && r.body === n.body && age < 24 * H && !upgrade(r)) return out("G1", `identical push already sent ${(age / H).toFixed(1)}h ago`);
  }
  const live = !!(road && road.mission_alerts && road.mission_alerts.liftoff_actual);
  let cls = null; try { cls = pp.classify(n, { vehicles: cur, flight: flightN, live }); } catch { cls = null; }
  if (cls && cls.key && /^[BS]\d+\|/.test(cls.key) && !/\|other(?:\||$)/.test(cls.key)) { // specific hardware + specific event only (generic keys would collide)
    const base = String(cls.key).split("|").slice(0, 2).join("|");
    for (const r of sent) { const age = nowT - Date.parse(r.sent_at || r.at); if (age >= 0 && age < 15 * 60000 && String(r.key || "").split("|").slice(0, 2).join("|") === base && !upgrade(r)) return out("G1", `same ${base} pushed ${Math.round(age / 60000)} min ago`); }
  }
  // internal launch-critical pushes: nothing more to check
  if (!isX(n) && CRITICAL_TITLE.test(n.title || "")) return allow;
  if (!isX(n) && !flightsIn(t).length && !vehiclesIn(t).length && /^(?:🚀|🏁|✅|🚧|📅|📡|⚠️|🛰️)/.test(n.title || "") && !/Starship\s*$/.test(n.title || "")) return allow; // other internal checker / mission-alert pushes keep their own policy

  // in the air: a liftoff of the current flight was pushed in the last 48 h (or the push is the checker's own "Flight N update") → official in-flight updates are never held for night / relevance
  const inFlight = sent.some((r) => /lift ?off|in the air/i.test(`${r.title} ${r.body}`) && nowT - Date.parse(r.sent_at || r.at) < 48 * H && (!flightN || !flightsIn(`${r.title} ${r.body}`).length || flightsIn(`${r.title} ${r.body}`).includes(flightN)));
  // G2 — recap wording / stale (official accounts included: SpaceX and Elon posts are not exempt)
  if (RECAP.test(both)) { const r = hit("G2", `recap wording ("${(both.match(RECAP) || [])[0]}")`); if (r) return r; }
  if (Number.isFinite(at) && nowT - at > 6 * H && isX(n)) { const r = hit("G2", `source post is ${((nowT - at) / H).toFixed(1)}h old`); if (r) return r; }
  // G2b (advisory) — names only an older flight
  const fl = flightsIn(both);
  if (flightN && fl.length && Math.max(...fl) < flightN && !inFlight) { const r = hit("G2b", `about Flight ${Math.max(...fl)} (a finished flight), current is ${flightN}`); if (r) return r; }
  // G3 — outcome claim with no live flight (X-origin only)
  if (cls && OUTCOME_TYPES.has(cls.type) && isX(n)) {
    const live = sent.some((r) => /lift ?off|in the air/i.test(`${r.title} ${r.body}`) && nowT - Date.parse(r.sent_at || r.at) < 72 * H && (!flightN || !flightsIn(`${r.title} ${r.body}`).length || flightsIn(`${r.title} ${r.body}`).includes(flightN)));
    if (!live) { const r = hit("G3", `"${cls.type}" claim but no Flight ${flightN || "?"} liftoff in the last 72h`); if (r) return r; }
  }
  // G4 — hardware that is not on the current flight
  const vs = [...new Set(vehiclesIn(both))];
  if (cur.length && vs.length && !vs.some((v) => cur.includes(v)) && !(flightN && flightsIn(both).includes(flightN))) { const r = hit("G4", `${vs.join("/")} is not Flight ${flightN || "?"} hardware (${cur.join(", ")})`); if (r) return r; }
  // G5 — plan claim the source does not make
  if (src && PLAN.test(t) && !PLAN_SUPPORT.test(src)) { const r = hit("G5", "plan claim not in the source post"); if (r) return r; }
  // G6 — night
  if (cls && !cls.milestone && !inFlight && Number.isFinite(nowT)) { const h = ukHour(nowT); if (h >= 23 || h < 7) { const r = hit("G6", `minor update at ${String(h).padStart(2, "0")}:xx UK (held for the app)`); if (r) return r; } }
  // G7 — non-milestone not about the current flight
  if (cls && !cls.milestone && isX(n) && cur.length && !inFlight) {
    const about = vs.some((v) => cur.includes(v)) || (flightN && flightsIn(both).includes(flightN));
    if (!about) { const r = hit("G7", "not a milestone and not about this flight's hardware"); if (r) return r; }
  }
  return adv[0] || allow;
}
// A plan claim in a card / line ('plans to', 'will') must be in the post it came from. Used at card-creation time too (check-road mission-updates).
const planUnsupported = (line, sourceText) => !!(sourceText && PLAN.test(String(line)) && !PLAN_SUPPORT.test(String(sourceText)));
module.exports = { planUnsupported, evaluate, mode, statusId, flightsIn, vehiclesIn };
