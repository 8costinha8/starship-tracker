/* Vehicle moves → Road box, and same-move duplicates (24 Nov, Tusk/Bernardo). Pure; Node (require) and browser (window.RoadMoveRoute).
   Pad activity shows only genuine pad work and moves to/from a launch pad. For every other move:
   24 Nov 13:11 (Bernardo): a vehicle's trip to the pad and back is Pad activity: a move to a pad, and the return FROM the pad
       (named, or the next reasonless move after the vehicle went to the pad / had pad work), file under Pad. The inherit rule
       below applies only to moves that are not to or from a pad.
   (a) a move/return with a stated reason files under that test ("… for cryo testing", "… after its static fire");
       with NO stated reason it inherits the vehicle's most recent test, open or finished within JUST_MS (4 days):
       "Ship 44 left Massey's." three days after its cryo test → Cryo tests. Pad tests (chopsticks, pusher tests, stacking)
       count as that most recent activity: a return right after them stays on Pad activity.
       A move to the test site (Massey's) with no test yet → the vehicle's next test (cryo, or static once cryo is done).
       Nothing to inherit → Pad activity (the old default; still "a vehicle move").
   (b) the same vehicle, the same kind of move and the same destination within DUP_MS (3 days), with no other location or
       test in between, is ONE move: the later post is a duplicate of the earlier entry (dupOf), never a second item.
   routeEvents(events) → { [id]: { box, why, dupOf? } } for ONE vehicle's events [{ id, at, type?, box?, text }]. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.RoadMoveRoute = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const JUST_MS = 4 * 864e5, DUP_MS = 3 * 864e5;
  const PLACES = [["Massey's", /\bmassey'?s?\b|\bmassey outpost\b/i], ["Mega Bay 1", /\bmega ?bay[- ]?1\b/i], ["Mega Bay 2", /\bmega ?bay[- ]?2\b/i], ["Mega Bay", /\bmega ?bay\b|\bthe bay\b|\bproduction(?: site)?\b|\bbuild site\b/i],
    ["Pad 1", /\bpad[- ]?1\b/i], ["Pad 2", /\bpad[- ]?2\b/i], ["LC-39A", /\blc-?39a\b/i], ["launch site", /\blaunch (?:site|pad|mount|tower)\b|\bolm\b|\borbital launch mount\b|\bthe pad\b|\bthe tower\b/i]];
  const PAD_PLACES = new Set(["Pad 1", "Pad 2", "LC-39A", "launch site"]);
  const MOVE = /\b(return(?:ed|s|ing)?|rolled|roll(?:s|ing)?(?: out| back)?|moved?|moving|head(?:ed|s|ing)?|left|leav(?:es|ing)|arriv(?:ed|es|ing)|entered|transport(?:ed|ing)?|is (?:now )?at|back (?:at|to|in)|went|parked)\b/i;
  const REASON = [["cryo", /\bcryo/i], ["static", /\bstatic[- ]?fire|\bspin prime/i], ["raptor", /\b(?:raptors?|engines?)\b/i], ["pad", /\bchopstick|\bcatch (?:tests?|fit)|\bpusher|\bstack(?:ed|ing)?\b|\bwet dress|\bwdr\b|\bqd arm|\bfit check/i]];
  const KIND = (t) => /\breturn|\bback (?:at|to|in)|rolled back|entered/i.test(t) ? "return" : /\bleft\b|\bleav/i.test(t) ? "leave" : /\barriv|\bis (?:now )?at\b/i.test(t) ? "arrive" : "head";
  function placesIn(t) { const hits = []; for (const [n, re] of PLACES) { const m = String(t || "").match(re); if (m && !hits.some((h) => h.n === n || (n === "Mega Bay" && /^Mega Bay \d/.test(h.n)))) hits.push({ n, i: m.index }); } return hits.sort((a, b) => a.i - b.i).map((h) => h.n); }
  function classify(text, type) {
    const t = String(text || "");
    const isMove = type === "move" || type === "rollout" || (!type && MOVE.test(t));
    if (!isMove) return { move: false };
    const kind = KIND(t), ps = placesIn(t);
    const from = /\bleft\b|\bleav|\bfrom\b/i.test(t) ? (t.match(/\b(?:left|leaves|leaving|from)\s+(?:the\s+)?([^.,;]+)/i) ? placesIn(t.match(/\b(?:left|leaves|leaving|from)\s+(?:the\s+)?([^.,;]+)/i)[1])[0] || null : null) : null;
    const dest = kind === "leave" && !/\b(?:to|for|toward|towards|headed|heading)\b/i.test(t) ? null : ps.find((p) => p !== from) || null;
    const tail = t.replace(/^[^.]*?\b(?:for|after|following|ahead of|to (?:begin|start|undergo)|post)\b/i, (m) => "\u0000" + m);
    const why = /\u0000/.test(tail) ? (REASON.find(([, re]) => re.test(t.slice(t.search(/\b(?:for|after|following|ahead of|to (?:begin|start|undergo)|post)\b/i)))) || [])[0] || null : null;
    return { move: true, kind, dest, from, reason: why, pad: PAD_PLACES.has(dest) || PAD_PLACES.has(from) || type === "rollout" };
  }
  const TEST_TYPES = { cryo_start: ["cryo", true], cryo_done: ["cryo", false], static_fire: ["static", false], engines_installed: ["raptor", false], stacked: ["pad", false] };
  function routeEvents(events) {
    const out = {};
    const list = (events || []).filter((e) => e && e.id).slice().sort((a, b) => (Date.parse(a.at || 0) || 0) - (Date.parse(b.at || 0) || 0));
    let last = null, cryoDone = false, place = null, atPad = false; const pending = []; const moves = []; // atPad: the vehicle went to a pad (or had pad work) and has not left it yet
    for (const e of list) {
      const t = Date.parse(e.at || 0) || 0, c = classify(e.text, e.type);
      const tt = TEST_TYPES[e.type] || (!c.move && e.box ? [e.box, false] : null);
      if (!c.move && tt) {
        const [box, open] = tt;
        last = { box, at: t, open: box === "cryo" || box === "static" ? open : false };
        if (box === "cryo" && !open) cryoDone = true;
        if (box === "cryo" || box === "static") for (const p of pending.splice(0)) if (t - p.at <= JUST_MS) out[p.id] = { box, why: `move before the ${box} test` };
        if (box === "pad") atPad = true;
        out[e.id] = { box, why: "test / pad work" }; place = c.dest || place; continue;
      }
      if (!c.move) { out[e.id] = { box: e.box || null, why: "not a move" }; continue; }
      // (b) duplicate of an earlier move: same kind + destination within DUP_MS, nothing else in between
      const prev = moves.length ? moves[moves.length - 1] : null;
      if (prev && prev.kind === c.kind && (prev.dest || prev.from) && prev.dest === c.dest && prev.from === c.from && t - prev.at <= DUP_MS && prev.seq === list.indexOf(e) - 1) {
        out[e.id] = { box: out[prev.id].box, why: "same move as " + prev.id, dupOf: prev.id }; continue;
      }
      let box, why;
      if (c.reason) { box = c.reason; why = "stated reason"; }
      else if (c.pad) { box = "pad"; why = "to/from a launch pad"; }
      else if (atPad) { box = "pad"; why = "return from the pad (a trip to the pad and back is pad activity, 24 Nov)"; }
      else if (last && (last.open || (t - last.at) <= JUST_MS)) { box = last.box; why = `inherits the ${last.open ? "open" : "just-finished"} ${last.box}`; }
      else if (c.dest === "Massey's") { box = cryoDone ? "static" : "cryo"; why = "to the test site: next test"; pending.push({ id: e.id, at: t }); }
      else if (c.from === "Massey's") { box = cryoDone ? "cryo" : "pad"; why = "from the test site"; }
      else { box = e.box || "pad"; why = "no test to inherit"; if (c.dest !== "Mega Bay 1" && c.dest !== "Mega Bay 2" && c.dest !== "Mega Bay") pending.push({ id: e.id, at: t }); }
      out[e.id] = { box, why };
      if (c.dest) atPad = PAD_PLACES.has(c.dest) || e.type === "rollout"; else if (c.from && PAD_PLACES.has(c.from)) atPad = false; else if (e.type === "rollout") atPad = true; else if (c.kind === "return" || c.kind === "leave") atPad = false;
      moves.push({ id: e.id, kind: c.kind, dest: c.dest, from: c.from, at: t, seq: list.indexOf(e) });
      place = c.dest || place;
    }
    return out;
  }
  return { routeEvents, classify, placesIn, JUST_MS, DUP_MS, PAD_PLACES };
});
