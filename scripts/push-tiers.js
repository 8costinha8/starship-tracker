/* Three-tier push relevance (the user-facing layer on top of push-policy.js; switched on with PUSH_TIERS=1 or a
   push-tiers.json {"on":true} in the repo root, so it can run in shadow first).
   Tier A  ALWAYS pushes, any hour, never rate-limited (only exact repeats are dropped):
           launch date / time change or first estimate, FAA licence, T-60 livestream, liftoff, in-flight official update,
           booster / ship outcome, deorbit countdown, ship caught, flight result, "Road to Flight N+1".
   Tier B  vehicle milestones of the CURRENT flight, once per (flight, vehicle, milestone), at most 1 per UK day,
           never 23:00-07:00 UK (held for the in-app / digest), never on launch day (A only that day):
           static fire done, cryo done, stacked, rolled to the pad, all engines in, WDR done, official mission-plan change.
   Tier C  never a push (in-app only): progress / "heads to", pad work, unconfirmed or rumour (Elon plans, single tracker
           inference, "may / could"), hardware of another flight, recaps and reviews of a finished flight, news fluff.
   decide(n, history, ctx) → { push, tier, event, key, reason }.  Pure: no I/O, no network, no sending. */
const pp = require("./push-policy.js");

const HEDGE = /\b(could|may|might|potential(?:ly)?|possible|possibly|reportedly|rumou?r\w*|expected|planned|plans? to|aims? to|hopes? to|preparing|prepare|ahead of|soon|ready for|noted|activity|would)\b/i;
const QUIET_FROM = 23, QUIET_TO = 7, B_PER_DAY = 1;
const ukDay = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(t)); // yyyy-mm-dd, UK day
const MONI = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const targetDay = (target, now) => { const m = String(target || "").match(/^(\d{1,2}) (\w{3})/); if (!m) return null; const y = ukDay(now).slice(0, 4); return `${y}-${String(MONI[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
const ukHour = (t) => Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/London" }).format(new Date(t)));
const when = (n) => Date.parse(n.sent_at || n.at);
const srcOf = (n) => { const m = String(n.body || "").match(/\(([^(),]+),\s*\d{1,2} \w{3}\)\.?\s*$/); return String((m && m[1]) || n.source || "").trim(); };
const isOfficialSrc = (s) => /^(spacex|faa|starbase|city of starbase|uscg|spacexstarship)$/i.test(s);
const isRumourSrc = (s) => /elon|musk/i.test(s);
const numbered = (t) => [...String(t).matchAll(/\b(?:(?:Booster|B)\s*(\d{2,3})|(?:Ship|S)\s*(\d{2,3}))\b/gi)].map((m) => (m[1] ? `B${m[1]}` : `S${m[2]}`));
const mentionsFlight = (t) => [...String(t).matchAll(/\bflight (\d+)\b/gi)].map((m) => +m[1]);

const OUTCOME = /\b(splash(?:ed)? ?down|diverted|offshore|caught|catch (?:was )?successful|landed|lost|exploded|broke up|abort(?:ed)?|returned? to (?:the )?launch site|reached orbit|ship caught|booster caught)\b/i;
const INFLIGHT = /\b(coasting|in orbit|heatshield|heat shield|reentry|re-entry|on track|deorbit|burn|stage separation|hot staging|ship is|booster is)\b/i;
const SF_DONE = /\b(conduct\w*|complet\w*|perform\w*|fired|fires|lit up|ignit\w*|done|full[- ]duration)\b/i;

// event classification of ONE push (no history). Returns { tier, event, vehicle?, target?, confirmed?, reason }
function tierOf(n, ctx = {}) {
  const title = String(n.title || ""), body = String(n.body || ""), t = `${title} ${body}`, vehicles = (ctx.vehicles || []).map((v) => String(v).toUpperCase());
  const src = srcOf(n);
  if (/unconfirmed|unofficial pad/i.test(title)) return { tier: "C", event: "unconfirmed", reason: "unconfirmed tracker inference" };
  // ── Tier A: the launch / flight itself ──
  if (/^\W*Road to Flight \d+\s*$/i.test(title)) return { tier: "A", event: "rollover", reason: "Road to the next flight opens" };
  if (/livestream|webcast/i.test(title) && /(?:lift ?off|launch) in \d+\s*(?:min|h)/i.test(t)) return { tier: "A", event: "livestream", reason: "T-60 livestream" };
  if (/deorbit in \d+\s*min/i.test(title)) return { tier: "A", event: "deorbit", reason: "deorbit countdown" };
  if (/lift ?off!|is in the air|has launched/i.test(title + " " + body) && !HEDGE.test(body) && !/launches? (?:starship|flight)/i.test(body)) return { tier: "A", event: "liftoff", reason: "liftoff" };
  if (/🏁|\bflight \d+\s*[—–-]\s*(?:success|partial|failure)\b/i.test(title)) return { tier: "A", event: "result", reason: "flight result" };
  if (/(?:ship|booster) caught!?/i.test(title)) return { tier: "A", event: `${/ship/i.test(title) ? "ship" : "booster"}_caught`, reason: "catch outcome" };
  if (/FAA\b[^.]{0,40}\b(approval|licen[cs]e)\b[^.]{0,40}\b(arrived|issued|granted|approved|confirmed|modified)\b|📜 FAA licen[cs]e: Confirmed/i.test(t) && !HEDGE.test(body.replace(/\bapproval has arrived\b/i, ""))) return { tier: "A", event: "faa_licence", reason: "FAA licence" };
  const ld = pp.classify({ ...n, at: n.at || n.sent_at }, { vehicles: ctx.vehicles || [] });
  if (/📅|launch delayed|launch time confirmed|new estimated date|launch (?:moved|scrubbed|postponed)/i.test(title) || (ld.type === "launch_date" && !/\bunofficial\b/i.test("") )) {
    const target = pp.launchTarget(body) || pp.launchTarget(title);
    if (target || /launch (?:delayed|scrubbed|postponed)|confirmed/i.test(title)) return { tier: "A", event: "launch_date", target, confirmed: /confirmed|official/i.test(t) && !/unconfirmed|unofficial/i.test(t), reason: "launch date / time" };
  }
  // ── official in-flight words, only while the flight is flying ──
  const flying = ctx.flightWindow && when(n) >= ctx.flightWindow[0] && when(n) <= ctx.flightWindow[1];
  if (flying && isOfficialSrc(src) && !HEDGE.test(body.replace(/\bahead of planned catch\b|\bon track for\b/i, ""))) {
    if (OUTCOME.test(body)) return { tier: "A", event: "stage_outcome", vehicle: (numbered(body)[0] ? (numbered(body)[0][0] === "B" ? "booster" : "ship") : (/booster|super heavy/i.test(body) ? "booster" : "ship")), reason: "booster / ship outcome (official, in flight)" };
    if (INFLIGHT.test(body)) return { tier: "A", event: "inflight_update", reason: "official in-flight update" };
  }
  if (ctx.flightResultAt && when(n) > ctx.flightResultAt + 3600000 && (OUTCOME.test(body) || /\bflight \d+\b/i.test(body) && /review|looked great|powered|first starship|reviewed/i.test(body))) return { tier: "C", event: "recap", reason: "recap of a flight that is already logged" };
  // ── Tier C by content: rumour, hedged, other flight ──
  if (isRumourSrc(src)) return { tier: "C", event: "rumour", reason: "Elon plan / opinion, not an event" };
  const named = numbered(body), foreign = named.filter((v) => vehicles.length && !vehicles.includes(v));
  if (foreign.length && !named.some((v) => vehicles.includes(v))) return { tier: "C", event: "other_flight", reason: `hardware of another flight (${foreign.join(", ")})` };
  const fl = mentionsFlight(body); if (ctx.flight && fl.length && !fl.includes(ctx.flight)) return { tier: "C", event: "other_flight", reason: `about Flight ${fl.join("/")}, current is ${ctx.flight}` };
  if (ctx.flightResultAt && when(n) > ctx.flightResultAt && !ctx.postFlightHardware) {} // (Road N+1 hardware still allowed below)
  // ── Tier B: current-flight vehicle milestones ──
  const veh = (named.find((v) => vehicles.includes(v)) || pp.vehicleOf(body, ctx.vehicles || [])).toUpperCase();
  const hedged = HEDGE.test(body.replace(/\b(preparing for flight \d+)\b/i, ""));
  if (/\bstatic[- ]?fir\w*/i.test(body) && SF_DONE.test(body) && !hedged && !/\b(campaign|road closed|closure)\b/i.test(body)) return { tier: "B", event: "static_fire", vehicle: veh, reason: "static fire completed" };
  if (/cryo/i.test(body) && /\b(complet\w*|done|passed|finished)\b/i.test(body) && !hedged && !/undergoing|in progress/i.test(body)) return { tier: "B", event: "cryo", vehicle: veh, reason: "cryo test completed" };
  if (/\b(wdr|wet dress)\b/i.test(body) && /\b(complet\w*|done|conducted|performed)\b/i.test(body) && !hedged) return { tier: "B", event: "wdr", vehicle: "STACK", reason: "wet dress completed" };
  if (/\b(stacked (?:on|atop)|full stack|fully stacked|stacks? (?:ship|s\d+))\b/i.test(body) && !hedged) return { tier: "B", event: "stack", vehicle: "STACK", reason: "ship stacked on booster" };
  if (/\b(all (?:\d+ )?(?:raptors?|engines?) (?:installed|in)|engines? installed|full set of (?:raptors?|engines?))\b/i.test(body) && !hedged) return { tier: "B", event: "engines", vehicle: veh, reason: "engines installed" };
  if (/\b(rolled (?:out )?to|rolls? (?:out )?to|roll(?:ed|s)? to) (?:the )?(?:launch site|launch pad|pad \d|orbital launch)/i.test(body) && !/\b(toward|towards|heads?|headed)\b/i.test(body) && !hedged) return { tier: "B", event: "rollout", vehicle: veh, reason: "rolled to the pad" };
  if (n.where === "mission" && isOfficialSrc(src) && /\bplans?\b|\bwill\b|\bnow\b|\bchanged?\b|\bswitch/i.test(body)) return { tier: "B", event: "plan", vehicle: "MISSION", reason: "official mission-plan change" };
  if (n.where === "mission" && isOfficialSrc(src) && /advisory|notam|closure|window/i.test(body)) return { tier: "B", event: "advisory", vehicle: "MISSION", reason: "official airspace / closure notice" };
  return { tier: "C", event: "progress", reason: "progress / small update: in-app only" };
}

const meta = (r, ctx) => (r.tier ? r : { ...tierOf(r, ctx), ...{} });
function stateFrom(history, ctx) {
  const kept = (history || []).filter((r) => r && r.verdict === "sent" && !r.retracted).map((r) => ({ r, m: meta(r, ctx) })).filter((x) => x.m.tier === "A" || x.m.tier === "B");
  const A = (e) => kept.filter((x) => x.m.event === e);
  const lastLiftoff = Math.max(-Infinity, ...A("liftoff").map((x) => when(x.r))), res = Math.max(-Infinity, ...A("result").map((x) => when(x.r)));
  const dates = A("launch_date").filter((x) => x.m.target).map((x) => x.m);
  return { kept, lastLiftoff, res, dates };
}
function decide(n, history, ctx = {}) {
  const now = Number.isFinite(ctx.now) ? ctx.now : when(n);
  const st = stateFrom(history, ctx);
  const c = { ...ctx, flightWindow: ctx.flightWindow || (Number.isFinite(st.lastLiftoff) ? [st.lastLiftoff, (Number.isFinite(st.res) && st.res > st.lastLiftoff ? st.res : st.lastLiftoff + 30 * 3600000) + 600000] : null), flightResultAt: Number.isFinite(st.res) ? st.res : ctx.flightResultAt };
  const m = tierOf(n, c);
  const out = (push, reason, extra = {}) => ({ push, tier: m.tier, event: m.event, reason, key: `${m.tier}|${m.event}|${m.vehicle || m.target || ""}`, ...extra });
  if (m.tier === "C") return out(false, `Tier C (${m.reason})`);
  const same = (e, f = () => true) => st.kept.filter((x) => x.m.event === e && f(x.m));
  if (m.tier === "A") {
    if (m.event === "launch_date" && m.target) {
      const prev = st.dates[st.dates.length - 1];
      if (prev && prev.target === m.target && !(m.confirmed && !prev.confirmed)) return out(false, `Tier A launch date ${m.target} already pushed — not a new date`);
    } else if (["livestream", "liftoff", "result", "deorbit", "rollover", "faa_licence", "ship_caught", "booster_caught"].includes(m.event)) {
      const day = ukDay(now), prior = same(m.event, () => true).find((x) => (m.event === "rollover" || m.event === "result" || m.event === "liftoff" || m.event === "faa_licence") ? Math.abs(when(x.r) - now) < 36 * 3600000 : ukDay(when(x.r)) === day);
      if (prior) return out(false, `Tier A ${m.event} already pushed ${new Date(when(prior.r)).toISOString().slice(0, 16)}Z`);
    } else if (m.event === "stage_outcome") {
      if (same("stage_outcome", (x) => x.vehicle === m.vehicle).length) return out(false, `Tier A outcome for ${m.vehicle} already pushed`);
    } else if (m.event === "inflight_update") {
      const last = same("inflight_update").pop(); if (last && now - when(last.r) < 3 * 3600000) return out(false, "Tier A in-flight update: one per 3 h");
    }
    return out(true, `Tier A ${m.reason}`);
  }
  // Tier B
  const hr = ukHour(now);
  const lastTarget = st.dates.length ? st.dates[st.dates.length - 1].target : null;
  if (ctx.launchDay === true || (lastTarget && targetDay(lastTarget, now) === ukDay(now) && !(Number.isFinite(st.res) && now > st.res))) return out(false, "Tier B held: launch day is Tier A only");
  if (hr >= QUIET_FROM || hr < QUIET_TO) return out(false, `Tier B held: quiet hours (${String(hr).padStart(2, "0")}:xx UK) → digest / in-app`);
  if (same(m.event, (x) => x.vehicle === m.vehicle).length && !/\b(another|second|third|again|re-?test)\b/i.test(n.body || "")) return out(false, `Tier B ${m.event} for ${m.vehicle} already pushed`);
  const day = ukDay(now);
  if (st.kept.filter((x) => x.m.tier === "B" && ukDay(when(x.r)) === day).length >= B_PER_DAY) return out(false, `Tier B: already ${B_PER_DAY} vehicle push today`);
  return out(true, `Tier B ${m.reason}`);
}
const enabled = ({ root = require("path").join(__dirname, ".."), env = process.env } = {}) => {
  if (env.PUSH_TIERS === "0") return false; if (env.PUSH_TIERS === "1") return true;
  try { return JSON.parse(require("fs").readFileSync(require("path").join(root, "push-tiers.json"), "utf8")).on === true; } catch { return false; }
};
module.exports = { tierOf, decide, enabled, QUIET_FROM, QUIET_TO, B_PER_DAY };
