/* ─────────────────────────────────────────────────────────────
   Predicted launch date (road.json "predicted"), kept by check-road.js.
   Pure helpers, no network: check-road.js passes in the posts it already
   fetched, the LL2 next-flight info and an LLM function.

   - Prefilter (free): a trusted post that names the next flight (or its
     vehicles) AND a launch/NET word AND a concrete calendar day. Undated
     wording ("4-6 weeks", "next month") never passes, so it never counts.
   - LLM only on those candidates: "does this give Flight N's NET/target day?"
     Its answer must be one of the days the regex found in the same text.
   - road.predicted_candidates: one latest dated mention per distinct source
     for the next flight: [{ flight, source, url, date, seen_at }].
   - "predicted" is written (mode "auto") only when 2+ distinct sources name
     the same day; several such days → the one with the newest mention.
     A hand-entered entry (mode "manual") stays until an auto one replaces it.
   - Cleared when LL2 confirms (same rule as the app), when the flight
     launches or is logged, or when the next flight number changes.
   ───────────────────────────────────────────────────────────── */

const MONTH_NAMES = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const ROUGH_PRECISION = /^(WK|M|Q[1-4]|H[12]|Y|FY|DEC)$/; // same as app.js
const LAUNCHED = ["In Flight", "Deployed", "Success", "Failure", "Partial Failure"];
const DAY = 86400000;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const todayIso = (now) => isoDay(now);

// Every concrete calendar day written in the text, as "YYYY-MM-DD".
// No year given → the next such day from ~30 days ago (so "8 Nov" seen in Oct is this year).
function datesIn(text, now = Date.now()) {
  const t = String(text || "");
  const out = new Set();
  const add = (y, m, d) => {
    if (!(d >= 1 && d <= 31) || m == null) return;
    let year = y ? Number(y) : new Date(now).getUTCFullYear();
    let ms = Date.UTC(year, m, d);
    if (!y && ms < now - 30 * DAY) ms = Date.UTC(++year, m, d);
    const dt = new Date(ms);
    if (dt.getUTCMonth() !== m) return; // 31 Nov etc.
    out.add(isoDay(ms));
  };
  for (const x of t.matchAll(/\b(20\d\d)-(\d{2})-(\d{2})\b/g)) add(x[1], Number(x[2]) - 1, Number(x[3]));
  for (const x of t.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON}\\.?(?:,?\\s+(20\\d\\d))?\\b`, "gi"))) add(x[3], MONTH_NAMES[x[2].toLowerCase()], Number(x[1]));
  for (const x of t.matchAll(new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(20\\d\\d))?`, "gi"))) add(x[3], MONTH_NAMES[x[1].toLowerCase()], Number(x[2]));
  return [...out];
}

// Cheap prefilter: names flight n (or its booster/ship) + a launch/NET word + a calendar day.
function prefilter(item, n, vehicles = [], now = Date.now()) {
  const t = `${item.title || ""} ${item.text || ""}`;
  const flight = new RegExp(`\\b(?:flight|ift)[\\s#-]*${n}\\b`, "i").test(t)
    || vehicles.some((v) => new RegExp(`\\b(?:${v[0] === "B" ? "booster|B" : "ship|S"})[\\s-]?${v.slice(1)}\\b`, "i").test(t));
  if (!flight) return false;
  if (!/\b(NET|no earlier than|launch\w*|lift-?off|target\w*|schedul\w*|fly|flies|flight date|window|planned for|slated)\b/i.test(t)) return false;
  return datesIn(t, now).some((d) => d >= todayIso(now));
}

function buildDatePrompt(n, items) {
  const list = items.map((it, i) => `${i + 1}. [${it.src}] ${it.title} — ${it.text}`).join("\n");
  return `For each item, say whether it states a specific calendar day that SpaceX Starship Flight ${n} is targeting / NET (no earlier than) for launch.
Only a concrete day counts (e.g. "NET 8 November", "targeting Nov 21"). Vague timing ("4-6 weeks", "next month", "late November") is null. Dates of other events (static fires, rollouts, other flights, past launches) are null.
Reply with ONLY a JSON array: [{"item": 1, "date": "YYYY-MM-DD"}, {"item": 2, "date": null}].

Items:
${list}`;
}

// LLM answers → mentions. A date is kept only if the regex found that same day in the item.
function mentionsFromReply(items, reply, n, now = Date.now()) {
  const out = [];
  for (const r of Array.isArray(reply) ? reply : []) {
    const it = r && Number.isInteger(r.item) && items[r.item - 1];
    if (!it || typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    if (!datesIn(`${it.title || ""} ${it.text || ""}`, now).includes(r.date) || r.date < todayIso(now)) continue;
    out.push({ flight: n, source: it.src, url: it.url || undefined, date: r.date, seen_at: it.publishedAt || new Date(now).toISOString() });
  }
  return out;
}

// One latest dated mention per distinct source, only for flight n.
function upsertMentions(list, mentions, n) {
  const byS = new Map((list || []).filter((c) => c.flight === n).map((c) => [c.source, c]));
  for (const m of mentions) {
    if (m.flight !== n) continue;
    const old = byS.get(m.source);
    if (!old || String(m.seen_at) >= String(old.seen_at)) byS.set(m.source, m);
  }
  return [...byS.values()].sort((a, b) => String(b.seen_at).localeCompare(String(a.seen_at)));
}

// LL2 says the date is real (same rule as the app's card) or the flight has gone.
function ll2State(next) {
  if (!next || !next.status && !next.precision && !next.date) return "unknown";
  if (LAUNCHED.includes(next.status)) return "launched";
  if (next.status === "Go" || next.status === "Hold") return "confirmed";
  const p = next.precision || "";
  if (p) return ROUGH_PRECISION.test(p) ? "unconfirmed" : "confirmed";
  const d = new Date(next.date);
  if (!Number.isFinite(d.getTime())) return "unconfirmed";
  const nextDay = new Date(d.getTime() + DAY);
  const placeholder = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && nextDay.getUTCDate() === 1;
  return placeholder ? "unconfirmed" : "confirmed";
}

// Works out the new predicted + candidates. Returns { predicted, candidates, reason }.
//   road: current road.json; target: next flight number; next: LL2 info for target
//   (or null); lastLogged: highest flight in app.js's log.
function computePredicted({ road, target, next, lastLogged, mentions = [], now = Date.now() }) {
  const today = todayIso(now);
  let predicted = road.predicted ? { ...road.predicted } : null;
  let reason = "kept";
  let candidates = upsertMentions(road.predicted_candidates, mentions, target).filter((c) => c.date >= today);
  const lls = next && next.n === target ? ll2State(next) : "unknown";

  if (predicted && Number(predicted.flight) !== target) { predicted = null; reason = `next flight is now ${target}`; }
  else if (predicted && lastLogged && Number(predicted.flight) <= lastLogged) { predicted = null; reason = "flight is in the log"; }
  else if (predicted && (lls === "launched" || lls === "confirmed")) { predicted = null; reason = `LL2 ${lls}`; }
  else if (predicted && predicted.net && predicted.net < isoDay(now - DAY)) { predicted = null; reason = "predicted day has passed"; }
  if (lls === "launched" || lls === "confirmed" || (lastLogged && target <= lastLogged)) return { predicted, candidates, reason };

  // 2+ distinct sources on one day; ties → newest supporting mention
  const byDay = new Map();
  for (const c of candidates) byDay.set(c.date, [...(byDay.get(c.date) || []), c]);
  const agreed = [...byDay.entries()].filter(([, cs]) => new Set(cs.map((c) => c.source)).size >= 2)
    .map(([date, cs]) => ({ date, cs, newest: cs.map((c) => String(c.seen_at)).sort().pop() }))
    .sort((a, b) => b.newest.localeCompare(a.newest));
  if (agreed.length) {
    const { date, cs } = agreed[0];
    const sources = cs.map((c) => ({ name: c.source, ...(c.url ? { url: c.url } : {}), note: `names ${date}`, seen_at: c.seen_at }));
    const auto = { flight: target, net: date, mode: "auto", basis: sources.map((s) => s.name).join(" · "), sources };
    const same = predicted && predicted.mode === "auto" && predicted.net === date && predicted.basis === auto.basis && JSON.stringify(predicted.sources) === JSON.stringify(sources);
    if (!same) { predicted = { ...auto, updatedAt: new Date(now).toISOString() }; reason = `auto: ${auto.basis} agree on ${date}`; }
  } else if (predicted && predicted.mode === "auto") { predicted = null; reason = "sources no longer agree on a day"; }
  return { predicted, candidates, reason };
}

function validatePredicted(road) {
  const p = road.predicted;
  if (p != null) {
    if (!Number.isInteger(p.flight) || !/^\d{4}-\d{2}-\d{2}$/.test(p.net || "")) throw new Error("bad predicted entry");
    if (p.mode !== "manual" && p.mode !== "auto") throw new Error("predicted.mode must be manual or auto");
    if (!Array.isArray(p.sources) || p.sources.length < 2 || p.sources.some((s) => !s || !s.name)) throw new Error("predicted needs 2+ named sources");
  }
  if (road.predicted_candidates != null && (!Array.isArray(road.predicted_candidates) || road.predicted_candidates.some((c) => !c.source || !/^\d{4}-\d{2}-\d{2}$/.test(c.date || "")))) throw new Error("bad predicted_candidates");
}

module.exports = { datesIn, prefilter, buildDatePrompt, mentionsFromReply, upsertMentions, ll2State, computePredicted, validatePredicted };
