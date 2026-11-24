/* Pre-publish guard for Road card summaries (24 Nov, Bernardo: "the pipeline must filter info so it displays correctly").
   A flight's card only talks about THAT flight's vehicles and pad, in one short line.
   guardSummary(text, ctx) → { ok, text, changed, issues[], reason }
     ctx = { flight: 16, vehicles: ["B23","S43"], max: SUMMARY_MAX }
   1. Off-topic: another flight number ("Flight 15", "F15", "IFT-15", "Flight 15's") or a booster/ship id that is not one of
      ctx.vehicles. The offending clause is stripped at a clause boundary ("now that Flight 15 has flown", ", while B22 …");
      the result is kept only if a sensible sentence remains (≥ 3 words, has a verb-ish word, no dangling connector).
      Otherwise ok=false, reason "summary_offtopic": the caller does not publish the line and lists it in data/needs-review.json.
   2. Length: SUMMARY_MAX = 38 chars fits one line in a 390px Road row (measured 24 Nov: the summary column is 252px wide at
      390px, Manrope 13px ≈ 6.2px/char → ~40 chars; 38 leaves a margin). Over the limit: shortened at a clause boundary
      ("…, after X" / " now that …" / " while …" / " as …") when a sensible sentence remains; otherwise kept as-is and flagged
      "summary_long" (the one-line CSS clamp with an ellipsis is the visual backstop).
   guardRoad(road, { fleet, now }) applies it to every card summary of the current flight (category latest / log_latest and
   each history entry's text / card_text / log_text / status_line / push_text / x_text) and returns the changes. Off-topic
   clauses are stripped from every field; the length rule shortens only the one-line fields (latest, log_latest, status_line)
   and only FLAGS a long card text (the Page 2 card keeps its full sentence; the Page 1 row clamps it to one line).
   Pure: no network, no file writes. */
const SUMMARY_MAX = 38;
const FLIGHT_RE = /\b(?:(?:starship\s+)?flight|ift|f)[\s-]?(\d{1,3})(?:'s)?\b/gi;
const VEH_RE = /\b(?:booster\s*|b)(\d{1,3})\b|\b(?:ship\s*|s)(\d{1,3})\b/gi;
// Clause boundaries, strongest first. Each split keeps the head (the main clause) and drops the tail clause.
const BOUNDARIES = [/\s+now that\s+/i, /\s*[,;:—–]\s*(?:now that|while|as|after|following|since|with|and|but|so|which)\b\s*/i, /\s*[;:—–]\s*/, /\s*,\s*/,
  /\s+(?:while|as|after|following|since|because|ahead of|before|once)\s+/i, /\s+(?:and|but)\s+/i];
const CONNECTOR_END = /\b(?:and|but|or|now|that|while|as|after|following|since|with|so|which|because|before|once|of|to|at|for|the|a|an)$/i;
const VERBISH = /\b(?:is|are|was|were|has|have|had|been|be|began|begun|completed|complete|resumed|resume|moved|rolled|returned|arrived|left|headed|lifted|stacked|fired|tested|installed|removed|started|finished|done|going|underway|continues|continued|work|works|ready|issued|confirmed|set|got|reached|entered|parked|seen)\b|\w+ed\b/i;
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
function flightsIn(text) { const out = []; String(text || "").replace(FLIGHT_RE, (m, n) => { out.push(Number(n)); return m; }); return out; }
function vehiclesIn(text) { const out = []; String(text || "").replace(VEH_RE, (m, b, s) => { out.push(b ? "B" + b : "S" + s); return m; }); return out; }
function issuesOf(text, ctx = {}) {
  const mine = new Set((ctx.vehicles || []).map(String));
  const iss = [];
  for (const n of flightsIn(text)) if (Number.isInteger(ctx.flight) && n !== ctx.flight) iss.push(`other flight ${n}`);
  if (mine.size) for (const v of vehiclesIn(text)) if (!mine.has(v)) iss.push(`vehicle ${v} not on Flight ${ctx.flight}`);
  return iss;
}
function sentence(s) {
  let t = norm(s).replace(/[\s,;:—–-]+$/, "");
  if (!t) return "";
  t = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(t) ? t : t + ".";
}
function sensible(s) {
  const t = norm(s).replace(/[.!?]+$/, "");
  const words = t.split(" ").filter(Boolean);
  return words.length >= 3 && VERBISH.test(t) && !CONNECTOR_END.test(t) && /^[A-Z0-9]/.test(t);
}
// Candidate shortenings: cut at each boundary (main clause = part before), strongest first; also drop leading clauses
// ("Now that Flight 15 has flown, Pad 2 work has resumed." → "Pad 2 work has resumed.").
function candidates(text) {
  const base = norm(text).replace(/[.!?]+$/, "");
  const out = [];
  for (const re of BOUNDARIES) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m; const idx = [];
    while ((m = g.exec(base))) { idx.push([m.index, m.index + m[0].length]); if (m[0].length === 0) g.lastIndex++; }
    for (const [a] of idx) out.push(base.slice(0, a));          // keep the head
    for (const [, b] of idx) out.push(base.slice(b));           // keep the tail (leading clause dropped)
  }
  return [...new Set(out.map(sentence).filter(Boolean))];
}
function guardSummary(text, ctx = {}) {
  const max = ctx.max || SUMMARY_MAX;
  const orig = norm(text);
  if (!orig) return { ok: true, text: orig, changed: false, issues: [] };
  let out = orig, changed = false, reason = null;
  const issues = issuesOf(orig, ctx);
  if (issues.length) {
    const ok = candidates(orig).filter((c) => !issuesOf(c, ctx).length && sensible(c)).sort((a, b) => b.length - a.length);
    if (!ok.length) return { ok: false, text: orig, changed: false, issues, reason: "summary_offtopic" };
    out = ok[0]; changed = true;
  }
  if (out.length > max) {
    const short = candidates(out).filter((c) => c.length <= max && !issuesOf(c, ctx).length && sensible(c)).sort((a, b) => b.length - a.length);
    if (short.length) { out = short[0]; changed = true; }
    else reason = "summary_long";
  }
  return { ok: true, text: out, changed, issues, ...(reason ? { reason, flag: true } : {}) };
}
const ENTRY_FIELDS = ["text", "card_text", "log_text", "status_line", "push_text", "x_text"];
const CAT_FIELDS = ["latest", "log_latest"];
const SHORT_FIELDS = ["status_line"]; // one-line fields shortened at a clause boundary (category latest / log_latest too)
const BOARD = ["cryo", "raptor", "static", "pad", "faa", "date"];
// Fleet vehicles for a flight (vehicles.json registry) plus road.vehicles.
function vehiclesFor(road, flight, fleet) {
  const vs = new Set(flight === road.flight ? (road.vehicles || []) : []);
  for (const v of Object.values((fleet && fleet.vehicles) || {})) if (v && v.flight === flight && v.type !== "pad") vs.add(v.id);
  return [...vs];
}
// The newest update that is newer than the entry itself (the app promotes it to the card's headline line).
function newerUpdate(h) { const t = Date.parse(h.at || 0) || 0; return (h.updates || []).filter((u) => u && typeof u.text === "string" && (Date.parse(u.at || 0) || 0) > t).sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] || null; }
function mineEntry(h, road) { return h && (!Number.isInteger(h.flight) || h.flight === road.flight) && !h.feed_hide && !require("./road-rules.js").PENDING.has(h.id); } // PENDING: S43 Pad card left as is (Bernardo deciding)
/* Apply to the current flight's cards. Off-topic lines that cannot be fixed are NOT published: the entry keeps its post but
   gets feed_hide + summary_hold (the card disappears until a human fixes it) and a needs-review item; a category line falls
   back to the newest in-scope entry, else "Nothing reported yet". Long lines are only flagged (review type summary_long). */
function guardRoad(road, { fleet = null, max = SUMMARY_MAX, now = new Date().toISOString() } = {}) {
  const res = { changed: [], held: [], flagged: [], review: [] };
  if (!road || !Array.isArray(road.categories)) return res;
  const ctx = { flight: road.flight, vehicles: vehiclesFor(road, road.flight, fleet), max };
  for (const c of road.categories) {
    if (!BOARD.includes(c.id)) continue;
    const head = (c.history || []).filter((h) => mineEntry(h, road)).sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0))[0] || null; // the row's headline
    for (const h of c.history || []) {
      if (!mineEntry(h, road) || h.summary_hold) continue;
      for (const f of ENTRY_FIELDS) {
        if (typeof h[f] !== "string" || !h[f]) continue;
        // Length: only the one-line status field is shortened here; the card text (Page 2) keeps its full sentence and is
        // flagged when over the limit (the Page 1 row clamps it); x_text is the source's own words.
        const g = guardSummary(h[f], SHORT_FIELDS.includes(f) ? ctx : { ...ctx, max: 1e9 });
        if (g.ok && (f === "text" || f === "card_text") && g.text.length > max) { g.flag = true; g.reason = "summary_long"; }
        if (!g.ok) {
          if (f === "text" || f === "card_text") { h.feed_hide = true; h.summary_hold = { field: f, issues: g.issues, at: now }; res.held.push({ cat: c.id, id: h.id, field: f, text: h[f], issues: g.issues });
            res.review.push({ type: "summary_offtopic", flight: road.flight, cat: c.id, id: h.id || null, field: f, text: h[f], issues: g.issues, url: h.url || null, at: now }); break; }
          continue; // a side field (log/push/status) that can't be fixed is left; the card itself is gated on text/card_text
        }
        if (g.changed) { res.changed.push({ cat: c.id, id: h.id, field: f, from: h[f], to: g.text }); h[f] = g.text; }
        if (g.flag && (f === "text" || f === "card_text") && h === head && !newerUpdate(h)) { // only the line the Page 1 row shows is flagged res.flagged.push({ cat: c.id, id: h.id, field: f, text: g.text });
          res.review.push({ type: "summary_long", flight: road.flight, cat: c.id, id: h.id || null, field: f, text: g.text, chars: g.text.length, max, url: h.url || null, at: now }); }
      }
    }
    for (const h of c.history || []) { // "Earlier updates" lines (and a promoted newer update) carry summaries too
      if (!mineEntry(h, road) || !Array.isArray(h.updates)) continue;
      const keep = [];
      for (const u of h.updates) {
        if (!u || typeof u.text !== "string") { keep.push(u); continue; }
        const g = guardSummary(u.text, { ...ctx, max: 1e9 });
        if (!g.ok) { res.held.push({ cat: c.id, id: h.id, field: "updates", text: u.text, issues: g.issues });
          res.review.push({ type: "summary_offtopic", flight: road.flight, cat: c.id, id: h.id || null, field: "updates", text: u.text, issues: g.issues, url: u.url || null, at: now }); continue; }
        if (g.changed) { res.changed.push({ cat: c.id, id: h.id, field: "updates", from: u.text, to: g.text }); u.text = g.text; }
        keep.push(u);
      }
      if (keep.length !== h.updates.length) h.updates = keep;
      const nu = h === head && newerUpdate(h);
      if (nu && nu.text.length > max) { res.flagged.push({ cat: c.id, id: h.id, field: "updates", text: nu.text });
        res.review.push({ type: "summary_long", flight: road.flight, cat: c.id, id: h.id || null, field: "updates", text: nu.text, chars: nu.text.length, max, url: nu.url || null, at: now }); }
    }
    for (const f of CAT_FIELDS) {
      if (typeof c[f] !== "string" || !c[f]) continue;
      const g = guardSummary(c[f], ctx);
      if (!g.ok) {
        const alt = (c.history || []).find((h) => mineEntry(h, road) && !h.feed_hide && h.text && guardSummary(h.text, ctx).ok && !issuesOf(h.text, ctx).length);
        const to = alt ? guardSummary(alt.text, ctx).text : "Nothing reported yet";
        res.changed.push({ cat: c.id, field: f, from: c[f], to, held: true });
        res.review.push({ type: "summary_offtopic", flight: road.flight, cat: c.id, id: null, field: f, text: c[f], issues: g.issues, at: now });
        c[f] = to; continue;
      }
      if (g.changed) { res.changed.push({ cat: c.id, field: f, from: c[f], to: g.text }); c[f] = g.text; }
      else if (g.flag) res.flagged.push({ cat: c.id, field: f, text: g.text });
    }
  }
  return res;
}
// The rule the summary writer's prompt carries (check-road.js buildPrompt / x-first classify): one source of truth.
const PROMPT_RULE = `Each summary is about THIS flight only: name only this flight's vehicles and pad, never another flight number (no "Flight 15", "F15", "IFT-15") and never a booster or ship that is not on this flight. One short line, at most ${SUMMARY_MAX} characters, no "now that …"/"after Flight N" clauses.`;
// needs-review merge: one item per type + id + field (no duplicates across runs).
function mergeReview(list, items) {
  const out = Array.isArray(list) ? list.slice() : [];
  for (const it of items || []) if (!out.some((x) => x && x.type === it.type && x.id === it.id && x.field === it.field && x.cat === it.cat && x.flight === it.flight)) out.push(it);
  return out;
}
module.exports = { SUMMARY_MAX, PROMPT_RULE, guardSummary, guardRoad, issuesOf, flightsIn, vehiclesIn, candidates, sensible, vehiclesFor, mergeReview };
