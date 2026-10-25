/* Road updates are filed by PURPOSE (which milestone the step serves), not by place.
   Pure helpers, no network. Used by check-road.js (Grok line apply + re-file), x-first.js (X posts).
   Order of rules:
   1. Engine installs / removals / swaps → raptor (even at the pad).
   2. Cryo campaign (Massey's, cryo / pressure / proof tests, rollback after cryo) → cryo.
   3. Static fire signals (static fire, propellant loading, chill, frost, venting, "fired", road/beach closures,
      transport ring) → static, unless the vehicle's static fire is done and it's launch prep → launch section.
   4. A vehicle step (rollout, lift onto the mount / Pad-2, transport stand, arrival, heads to the pad, rollback):
      open static campaign (not yet fired, or the fire's own day) → static; rollback after the fire → static;
      after the fire: stacking, WDR, launch closure → launch section.
   5. Pad activity ONLY for pad work with no vehicle campaign behind it (tower, chopsticks, QD arm, deluge,
      OLM repairs, flame trench, tank farm, pad builds).
   6. Nothing matched: the model's box when its confidence ≥ 0.7, else the campaign-window default, never Pad
      activity when a vehicle is named. */
const C = require("./cleanup.js");
const ENGINE = /\b(?:raptors?|engines?|rvacs?|rsls?)\b[^.]{0,40}\b(?:install|reinstall|remov|swap|deliver|spotted|fitted|fitting|jig)\w*|\b(?:install|reinstall|remov|swap|deliver|fitt?)\w*\b[^.]{0,15}\b(?:raptors?|engines?)\b|lifting jig/i;
const CRYO = /massey|\bcryo|pressure test|proof test|test tank/i;
const STATIC_SIG = /static[- ]?fire|propellant|\bchill|\bfrost|\bvent(s|ed|ing)?\b|\bfired\b|road (?:closure|closed|delay)|road is closed|beach closure|closure notice|testing closure|mayor's order|transport ring|\bfor testing\b/i;
const STACK = /\bship\b[^.]{0,40}\bstack|stack\w* (?:on|onto) (?:the )?booster|full(?:y)? stack|\bwdr\b|wet dress|launch closure|launch window/i; // ship stacking, not a booster set on the mount
const CHOP_VEH = /chopstick|catch (?:test|position)|\bsqd\b|fit[- ]?check/i;
const PAD_ONLY = /\btower\b|chopstick|\b[bs]?qds?\b|quick disconnect|deluge|\bolm\b|launch mount|flame trench|tank farm|pad (?:build|work)|catch test|hold-?down|work platform|servicing structure|\bpad\b/i;
const MOVE = /roll(?:s|ed|ing)?[ -]?(?:out|back|to)|\blift(?:s|ed|ing)?\b|lowered|launch (?:mount|site|pad)|\bpad[- ]?\d|\bolm\b|transport stand|left mega ?bay|mega ?bay|arriv|heads? (?:to|back)|\bmove|\bat the pad|rollback|returns?/i;
const ROLLBACK = /roll(?:s|ed|ing)?[ -]?back|rollback|returns? to|heads? back|back to (?:the )?(?:mega ?bay|production)/i;
const vehOf = (t, hw) => { const v = new Set(C.named ? C.named(t) : []); String(t).replace(/\b(?:Booster\s*|B)(\d{1,3})\b|\b(?:Ship\s*|S)(\d{1,3})\b/gi, (_, b, s) => v.add(b ? "B" + b : "S" + s)); const h = String(hw || "").match(/^(?:Booster\s*|B)(\d+)|^(?:Ship\s*|S)(\d+)/i); if (h) v.add(h[1] ? "B" + h[1] : "S" + h[2]); return [...v]; };
const hwKey = (h) => { const m = String((h.milestone && h.milestone.hardware) || h.hardware || "").match(/^\s*(?:Ship\s*|S)(\d+)|^\s*(?:Booster\s*|B)(\d+)/i); return m ? (m[1] ? "S" + m[1] : "B" + m[2]) : null; };
const doneOf = (h) => h.complete === true || (h.milestone && h.milestone.phase === "completed");
// The launch/stacking section: an existing one if there is, else the closest existing (Pad activity).
function launchBox(road) {
  const c = road.categories.find((x) => /^(stack|stacking|launch)$/.test(x.id) || /stack|launch(?! date)/i.test(x.name || ""));
  return c ? c.id : "pad";
}
// Per-vehicle section states from the data: the static fire / cryo completion day (or null = still open).
function states(road) {
  const out = {};
  const vs = new Set(road.vehicles || []);
  for (const c of road.categories) for (const h of c.history || []) { const k = hwKey(h); if (k) vs.add(k); }
  for (const v of vs) out[v] = { static: null, cryo: null };
  for (const id of ["static", "cryo"]) {
    const c = road.categories.find((x) => x.id === id); if (!c) continue;
    for (const h of c.history || []) {
      const t = `${h.text || ""} ${h.log_text || ""}`;
      const ev = id === "static" ? /static[- ]?fire/i : /cryo|proof/i, mt = (h.milestone && h.milestone.type) || "";
      const done = ((doneOf(h) && (id === "static" ? mt === "static_fire" : /cryo|proof/.test(mt))) || (/\bcomplet\w*|\bconducted\b/i.test(t) && ev.test(t))) && !/\b(could|may|might|ready|waiting|expected|ahead of)\b/i.test(h.text || "");
      if (!done) continue;
      for (const v of vehOf(t, h.hardware)) { const d = C.dayNum(h); if (out[v] && (out[v][id] == null || d < out[v][id])) out[v][id] = d; }
    }
  }
  return out;
}
function describeStates(road) {
  const st = states(road), day = (n) => (n == null ? null : new Date(n).toISOString().slice(5, 10));
  return Object.entries(st).filter(([v]) => (road.vehicles || []).includes(v)).map(([v, s]) => `${v}: cryo ${s.cryo != null ? `done (${day(s.cryo)})` : "open"}, static fire ${s.static != null ? `done (${day(s.static)})` : "open"}`).join("; ");
}
// → { box, why }. step: { text, hardware, box (model's pick), confidence, date, log_date, at }
function purposeOf(road, step, st = states(road)) {
  const has = (id) => road.categories.some((c) => c.id === id);
  const t = String(step.text || "");
  const keep = step.box;
  if (keep === "faa" || keep === "date") return { box: keep, why: "licence / launch date" };
  const vs = vehOf(t, step.hardware).filter((v) => !st[v] || true);
  const day = C.dayNum(step);
  const fired = (v) => st[v] && st[v].static != null && day > st[v].static;
  const anyOpen = vs.length ? vs.some((v) => !fired(v)) : Object.values(st).some((s) => s.static == null);
  if (has("raptor") && ENGINE.test(t)) return { box: "raptor", why: "engine install / removal / swap" };
  if (has("cryo") && CRYO.test(t) && !/static[- ]?fire/i.test(t)) return { box: "cryo", why: "cryo campaign" };
  if (STATIC_SIG.test(t) && (/static[- ]?fire/i.test(t) || anyOpen || (vs.length && ROLLBACK.test(t))))
    return { box: "static", why: /static[- ]?fire/i.test(t) ? "source says static fire" : "static fire signal in an open campaign" };
  if (vs.length) {
    if (vs.every(fired)) {
      if (ROLLBACK.test(t)) return { box: "static", why: "rollback after the static fire" };
      if (STACK.test(t) || MOVE.test(t) || CHOP_VEH.test(t)) return { box: launchBox(road), why: "launch prep after static fires" };
    } else {
      if (CHOP_VEH.test(t) && !/static/i.test(t)) return { box: launchBox(road), why: "vehicle fit check on the tower" };
      if (STACK.test(t)) return { box: launchBox(road), why: "stacking / launch" };
      if (MOVE.test(t) || PAD_ONLY.test(t) || /ahead of|\bfor\b/i.test(t)) return { box: "static", why: "vehicle step in its open static fire campaign" };
    }
  }
  if (!vs.length && PAD_ONLY.test(t)) return { box: "pad", why: "pad work with no vehicle campaign" };
  if (keep && has(keep) && (step.confidence == null || step.confidence >= 0.7) && !(keep === "pad" && vs.length)) return { box: keep, why: "model pick" };
  if (vs.length) return { box: vs.some((v) => !fired(v)) ? "static" : launchBox(road), why: "campaign window default" };
  return { box: keep && has(keep) ? keep : "pad", why: "default" };
}
// Re-file existing entries by purpose. Same entry ids (deep links keep working), no push. An entry's
// updates that are themselves pure pad work stay in Pad activity as their own entry (<id>-pad).
// Also tags each feed_items push with its section (box). Returns the list of moves.
function refile(road) {
  const st = states(road), moves = [];
  const cat = (id) => road.categories.find((c) => c.id === id);
  const lineOf = (h) => [h.text, h.log_text, h.x_post && h.x_post.text].filter(Boolean).join(" ");
  for (const c of [...road.categories]) {
    if (c.id === "faa" || c.id === "date") continue;
    for (const h of [...(c.history || [])]) {
      if (h.kind === "check" || h.refiled_pin) continue;
      const to = purposeOf(road, { ...h, text: lineOf(h), box: c.id }, st).box;
      if (to === c.id || !cat(to)) continue;
      const stay = (h.updates || []).filter((u) => purposeOf(road, { ...u, text: u.text, box: c.id }, st).box === c.id); // e.g. pure pad work, or a ship fit check on the tower
      const go = (h.updates || []).filter((u) => !stay.includes(u));
      c.history.splice(c.history.indexOf(h), 1);
      const moved = { ...h, stage: h.stage ? to : h.stage, refiled_from: c.id };
      if (h.updates) moved.updates = go;
      if (moved.updates && !moved.updates.length) delete moved.updates;
      cat(to).history = [...(cat(to).history || []), moved].sort((a, b) => C.dayNum(b) - C.dayNum(a) || (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));
      moves.push({ id: h.id, text: h.text, from: c.id, to });
      if (stay.length) {
        const [first, ...rest] = stay;
        const pe = { trust: h.trust, src: h.src, tier: h.tier, ...(h.flight ? { flight: h.flight } : {}), ...first, id: `${h.id || "entry"}-pad`, split_from: h.id, ...(rest.length ? { updates: rest } : {}) };
        c.history.push(pe); c.history.sort((a, b) => C.dayNum(b) - C.dayNum(a));
        moves.push({ id: pe.id, text: pe.text, from: c.id, to: c.id, split: true });
      }
      if (c.latest === h.text || c.log_latest === (h.log_text || h.text) || c.log_latest === (h.status_line || require("./cleanup.js").shortLine(h.log_text || h.text))) { const n = (c.history || []).find((x) => x.kind !== "check"); if (n) { c.latest = n.text; c.log_latest = n.status_line || require("./cleanup.js").shortLine(n.log_text || n.text); } }
    }
  }
  for (const f of road.feed_items || []) {
    if (!f || !f.body || f.kind !== "news") continue;
    const p = purposeOf(road, { text: f.body, date: f.date, at: f.at }, st);
    const vs = vehOf(f.body);
    const box = vs.length || p.box !== "pad" ? p.box : null;
    if (box && f.box !== box) { moves.push({ id: f.id, text: f.body, from: f.box || "Starship news card", to: box, feed: true }); f.box = box; }
  }
  return moves;
}
const promptRules = (road) => `Purpose rule: file each step under the milestone it SERVES, not where it happens.
- static: from the first static fire signal (rollout to the pad for a static fire, road or beach closure, lift onto the launch mount / Pad-2 while not yet fired, chill-down, frost, propellant loading, venting, "fired") until the static fire completes, plus the rollback afterwards.
- cryo: rollout to Massey's, cryo / pressure tests, frost on a test tank at Massey's, rollback to the Mega Bay after cryo.
- raptor: engine installs, removals and swaps, even at the pad.
- ${launchBox(road)}: after static fires are done: lift onto the mount for launch, stacking, WDR, launch closure.
- pad: ONLY pad work with no vehicle campaign behind it (tower, chopsticks, QD arm, deluge, OLM repairs, tank farm, pad builds).
Current section states per vehicle: ${describeStates(road) || "unknown"}.
"confidence": 0-1, how sure you are of the section; below 0.7 the tracker uses the campaign window instead.`;
// The line decides; the source's own words only help when the line alone has no signal.
function purposeFor(road, line, source, step = {}) {
  const a = purposeOf(road, { ...step, text: line });
  if (!/^(model pick|default)$/.test(a.why) || !source) return a;
  return purposeOf(road, { ...step, text: `${line} ${source}` });
}
module.exports = { purposeOf, purposeFor, refile, states, describeStates, launchBox, promptRules, vehOf };
