/* Vehicle moves -> Road box, same-move duplicates, and test-site trips: ONE rule module (24 Nov v5: push 2's move-route
   and the footer preview's pad-trip / TestTrip merged). Pure; Node (require) and browser (window.RoadMoveRoute; also
   window.PadTrip / window.TestTrip, the same object, for older callers).
   Part 1, routing (push 2, unchanged):
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
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else { root.RoadMoveRoute = factory(); root.PadTrip = root.TestTrip = root.RoadMoveRoute; } })(typeof self !== "undefined" ? self : this, function () {
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
  /* Part 2, test-site trips (display: rtfCards folds each trip into its test's card). Pure data, no fetch, no DOM.
   Rule (24 Nov, Bernardo via Tusk; generalised 13:57 UK): a vehicle's trip to a TEST SITE, the test there and its
   return are ONE activity, shown on that test's card:
     Massey's → Cryo tests / Static fires (the box of the test done there)
     a launch pad → Pad activity (chopstick lifts, pusher / load tests, mounting)
   The outbound move(s), the test posts and the return move(s) fold into one entry; the headline is the test (a pad
   chopstick lift reads "Ship 43 lifted on the chopsticks at Pad 2."; a Massey trip leads with its test, the completed
   one first), every other post sits under Earlier updates OLDEST FIRST (trip_order: "chrono"). Same-move duplicates
   merge (same vehicle, same move — out / back —, same phase — set off / arrived —, within MERGE_H hours): the earliest
   post is the row, the others go in its merged list. A post naming two vehicles ("Ship 44 and Booster 24 returned …",
   road.feed_items news) attaches to EACH vehicle's own trip. A move is only folded when the trip has a test at that
   site (bracketed); a lone move ("headed back to Massey's for more cryo testing" with no test yet) is untouched.
   tripKind(text) classifies a trip post; applyToRoad(road) returns a NEW road (input untouched). Fleet registry entries may carry `sources` (same-event posts):
   they become the row's merged list. road.trip_feed (or road.feed_items) supplies the extra news posts. */
  const MERGE_H = 72;       // "within a few days"
  const TRIP_MAX_D = 14;    // a trip lasts at most this long (start → return)
  const RETURN_TAIL_H = 18; // after the first return post, later return posts within this window are the same return
  const BOXES = ["cryo", "raptor", "static", "pad"];
  const T = (x) => { const t = Date.parse((x && x.at) || ""); return Number.isFinite(t) ? t : 0; };
  const txt = (x) => String((x && (x.card_text || x.text || x.body)) || "");
  const sid = (u) => (String(u || "").match(/status\/(\d+)/) || [])[1] || null;
  const PROD = /\b(mega ?bay ?\d?|megabay ?\d?|high ?bay|production( site)?|build site|starfactory|sanchez)\b/i;
  const MASSEY = /\bmassey'?s?\b|\bmassey outpost\b/i;
  const PAD = /\b(pad(?:[- ]?\d)?|launch (site|mount|tower)|olm|tower|chopsticks?)\b/i;
  const AT_PAD = /\bchopsticks?\b|\blift(ed|s|ing)?\b|\bairborne\b|\bpusher\b|\bload test|\bmount(ed|ing)? on\b|\bplaced on\b|\bsqd\b|\bcatch\b|\bcaught\b/i;
  const TEST = /\bcryo|\bproof\b|\bstatic[- ]?fire|\bspin prime|\bfrost/i;
  const ARRIVE = /\b(arrived|arrives|arriving|reached|is (now )?at|now at|were (together )?at|returned to|back (at|in|inside))\b/i;
  const DEPART = /\b(headed|heading|rolled|rolling|rolls|roll|moved|moving|left|leav(es|ing)|departed|en route|on (its|the) way|returning|transported|transporting|rolled back|double roll)\b/i;
  const FROM_MASSEY = /\b(left|leav(?:es|ing)|depart\w*|from|exit)\b[^.]*\bmassey|\bleft the cryo (station|stand)|\bleaves? the (cryo )?stand/i;
  const padName = (t) => { const m = String(t || "").match(/\bpad[- ]?(\d)\b/i); return m ? `Pad ${m[1]}` : null; };
  const phase = (s) => (ARRIVE.test(s) && !/\bheaded|\bheading|\bleft\b|\bdouble roll/i.test(s) ? "arrive" : "depart");
  // kind: to_site / at_site (the test) / from_site (the return; site null = back to production) / leave_prod / null
  function tripKind(t) {
    const s = String(t || "");
    const back = /\b(back|returned|returning|return)\b/i.test(s);
    if (FROM_MASSEY.test(s)) return { kind: "from_site", site: "massey", phase: phase(s.replace(/\bfrom\b/i, "")) === "arrive" && PROD.test(s) ? "arrive" : "depart" };
    if (PROD.test(s) && (back || /\brolled back\b/i.test(s)) && !/\bto massey|\bback to massey/i.test(s)) return { kind: "from_site", site: null, phase: phase(s) };
    if (DEPART.test(s) && TEST.test(s) && /\bfor (its |a |the )?(cryo|proof|static)/i.test(s) && !PAD.test(s)) return { kind: "to_site", site: "massey", phase: "depart" }; // "rolled out for its cryogenic proof campaign"
    if (MASSEY.test(s) && (DEPART.test(s) || ARRIVE.test(s) || /\bfor (its )?cryo|\bto massey|\bfor massey/i.test(s))) return { kind: "to_site", site: "massey", phase: phase(s) };
    if (PROD.test(s) && (back || ARRIVE.test(s)) && !(/\bleft\b|\bleav/i.test(s) && !back)) return { kind: "from_site", site: null, phase: phase(s) };
    if (!back && PAD.test(s) && (ARRIVE.test(s) || DEPART.test(s)) && !AT_PAD.test(s.replace(/\bfor chopstick (tests?|lifts?)\b/i, ""))) return { kind: "to_site", site: "pad", phase: phase(s) };
    if (AT_PAD.test(s) && !TEST.test(s) && !MASSEY.test(s)) return { kind: "at_site", site: "pad", phase: null };
    if (TEST.test(s) && !(DEPART.test(s) && !/\bstand\b/i.test(s))) return { kind: "at_site", site: "massey", phase: null };
    if (PROD.test(s) && /\bleft\b|\bleav|\brolled out\b/i.test(s)) return { kind: "leave_prod", site: null, phase: "depart" };
    if (DEPART.test(s) && !PAD.test(s)) return { kind: "move", site: null, phase: "depart" }; // a move that names no place ("… in the first double roll")
    return { kind: null, site: null, phase: null };
  }
  const vehOf = (h) => { const hw = String((h && h.hardware) || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B"); return /^[SB]\d+$/.test(hw) ? hw : null; };
  const vehName = (v) => (/^S/.test(v) ? `Ship ${v.slice(1)}` : `Booster ${v.slice(1)}`);
  const names = (s) => [...String(s || "").matchAll(/\b(?:(B|S)(\d{2,3})|(Booster|Ship)\s+(\d{2,3}))\b/gi)].map((x) => ((x[1] || x[3])[0]).toUpperCase() + (x[2] || x[4]));
  // every post of a vehicle: each history entry's own post, its updates, and news posts naming it (combined posts too)
  function postsOf(road, v) {
    const out = [], urls = new Set();
    for (const c of (road && road.categories) || []) {
      if (!BOXES.includes(c.id)) continue;
      for (const h of c.history || []) {
        if (!h || vehOf(h) !== v || h.feed_hide || h.trust === "unconfirmed") continue;
        out.push({ cid: c.id, entry: h, post: h, own: true, ...tripKind(txt(h)) }); if (h.url) urls.add(h.url);
        for (const s of h.sources || []) if (s && s.url) urls.add(s.url);
        for (const u of h.updates || []) if (u && u.text) { out.push({ cid: c.id, entry: h, post: u, own: false, ...tripKind(txt(u)) }); if (u.url) urls.add(u.url); for (const m of u.merged || []) if (m && m.url) urls.add(m.url); }
      }
    }
    for (const f of (road && (road.trip_feed || road.feed_items)) || []) {
      if (!f || f.kind !== "news" || !f.body || !f.url || urls.has(f.url) || !names(f.body).includes(v)) continue;
      const c = tripKind(f.body); if (!c.kind) continue;
      out.push({ cid: null, entry: null, post: { text: f.body, at: f.event_at || f.at, date: f.date, url: f.url, news: true }, own: false, news: true, ...c });
    }
    return out.sort((a, b) => T(a.post) - T(b.post));
  }
  // trips: start at a move to a test site, run through the test(s) there, end with the return (and its same-return tail)
  function tripsOf(posts) {
    const trips = []; let cur = null;
    const close = () => { if (cur && (cur.tests > 0 || (cur.site === "pad" && cur.ret))) trips.push({ site: cur.site, members: cur.mem, start: cur.start, end: T(cur.mem[cur.mem.length - 1].post), returned: !!cur.ret }); cur = null; };
    for (const p of posts) {
      const t = T(p.post);
      if (cur && t - cur.start > TRIP_MAX_D * 864e5) close();
      if (p.kind === "to_site") {
        if (cur && cur.site === p.site && !cur.ret) { cur.mem.push(p); continue; }
        close(); cur = { site: p.site, mem: [p], start: t, tests: 0, ret: null }; continue;
      }
      if (!cur) continue;
      if (cur.ret) { if ((p.kind === "move" || (p.kind === "from_site" && (p.site == null || p.site === cur.site))) && t - cur.ret <= RETURN_TAIL_H * 36e5) { cur.mem.push(p); continue; } close(); continue; }
      if (p.kind === "at_site") { if (p.site === cur.site) { cur.mem.push(p); cur.tests++; } else if (cur.site === "pad" || p.own) close(); continue; }
      if (p.kind === "leave_prod" && !cur.tests) { cur.mem.push(p); continue; }
      if (p.kind === "move") { if (cur.tests) { cur.mem.push(p); cur.ret = cur.ret || t; } else cur.mem.push(p); continue; } // a bare move: the return once tested, else the way out
      if (p.kind === "from_site" && (p.site == null || p.site === cur.site)) { cur.mem.push(p); if (cur.tests || cur.site === "pad" || p.site) cur.ret = t; }
    }
    close();
    return trips;
  }
  // same-move duplicates: same move + phase within MERGE_H → the earliest stays, the rest go in its merged list
  function mergeMoves(rows) {
    const out = [], bare = [];
    for (const r of rows.slice().sort((a, b) => T(a) - T(b))) {
      const c = tripKind(txt(r));
      if (c.kind === "move") { bare.push(r); continue; }
      const k = c.kind === "to_site" || c.kind === "from_site" ? (c.kind === "from_site" ? "from" : "to:" + c.site) + "|" + c.phase : null;
      const dup = k && out.find((o) => o._k === k && T(r) - T(o) <= MERGE_H * 36e5);
      if (dup) { dup.merged = [...(dup.merged || []), { text: r.text, at: r.at, url: r.url }, ...(r.merged || [])]; continue; }
      out.push({ ...r, _k: k });
    }
    // a move that names no place ("… in the first double roll") is the same move as the nearest move row within 12 h
    for (const r of bare) {
      const near = out.filter((o) => o._k && Math.abs(T(r) - T(o)) <= 12 * 36e5).sort((a, b) => Math.abs(T(r) - T(a)) - Math.abs(T(r) - T(b)))[0];
      if (near) near.merged = [...(near.merged || []), { text: r.text, at: r.at, url: r.url }, ...(r.merged || [])]; else out.push({ ...r, _k: null });
    }
    // 24 Nov v5: a trip's steps never go backwards (left the bay -> road -> site -> test -> return). A move posted after a
    // later step (Blobifie 20 Nov 20:08 "left Megabay 1" after B24 was on Highway 4 at 06:05 and at Massey's by 13:44) is a
    // late report of that earlier step: it merges into the row of that step (or the trip's first row of the same leg).
    const chrono = out.sort((a, b) => T(a) - T(b)), kept = []; let top = -1;
    const leg = (x) => (x <= 2 ? "out" : x >= 4 ? "back" : "test");
    for (const r of chrono) {
      const st = stepOf(r);
      if (st != null && st !== 3 && st < top) {
        const into = kept.filter((k) => stepOf(k) != null && stepOf(k) <= st && leg(stepOf(k)) === leg(st)).pop() || kept.find((k) => stepOf(k) != null && leg(stepOf(k)) === leg(st));
        if (into) { into.merged = [...(into.merged || []), { text: r.text, at: r.at, url: r.url, late: true }, ...(r.merged || [])]; continue; }
      }
      if (st != null) top = Math.max(top, st);
      kept.push(r);
    }
    return kept.map(({ _k, ...r }) => r);
  }
  // step of a trip post: 0 left the bay, 1 on the way (road), 2 at the site, 3 the test, 4 set off back, 5 back at the bay
  function stepOf(r) {
    const c = tripKind(txt(r));
    if (c.kind === "leave_prod") return 0;
    if (c.kind === "to_site") return c.phase === "arrive" ? 2 : 1;
    if (c.kind === "at_site") return 3;
    if (c.kind === "from_site") return c.phase === "arrive" ? 5 : 4;
    return null;
  }
  const LIFT = /\bchopsticks?\b.*\blift|\blift.*\bchopsticks?\b|\blifted .*\btower\b/i;
  const DONE = (h) => !!(h && (h.complete || (h.milestone && h.milestone.phase === "completed") || /\bcompleted\b|\bfinished\b|\bwrapped up\b/i.test(txt(h))));
  function headlineOf(trip) {
    const at = trip.members.filter((p) => p.kind === "at_site");
    if (trip.site === "pad") return at.find((p) => p.own && LIFT.test(txt(p.post))) || at.find((p) => p.own) || at.find((p) => LIFT.test(txt(p.post))) || at[0] || null;
    const own = at.filter((p) => p.own && p.cid !== "pad");
    return own.filter((p) => DONE(p.post)).pop() || own.pop() || null; // the (last) completed test, else the latest test entry
  }
  const rowOf = (e) => ({ text: e.text, ...(e.card_text ? { card_text: e.card_text } : {}), at: e.at, date: e.date, url: e.url, src: e.src,
    ...((e.sources || []).filter((s) => s && s.url && s.url !== e.url).length ? { merged: e.sources.filter((s) => s && s.url && s.url !== e.url).map((s) => ({ at: s.at, url: s.url, src: s.src })) } : {}) });
  function applyToRoad(road) {
    if (!road || !Array.isArray(road.categories)) return road;
    const vs = new Set();
    for (const c of road.categories) for (const h of c.history || []) { const v = vehOf(h); if (v && BOXES.includes(c.id)) vs.add(v); }
    let cats = road.categories.map((c) => ({ ...c, history: (c.history || []).slice() }));
    let changed = false;
    for (const v of vs) {
      for (const trip of tripsOf(postsOf({ categories: cats, trip_feed: road.trip_feed || road.feed_items }, v))) {
        const head = headlineOf(trip);
        if (!head) continue;
        const entries = [...new Set(trip.members.map((p) => p.entry).filter(Boolean))];
        const fold = entries.filter((e) => trip.members.some((p) => p.own && p.entry === e)); // an entry joins when its own post is part of the trip
        const news = trip.members.filter((p) => p.news).map((p) => p.post);
        if (fold.length < 2 && fold[0] && fold[0].test_trip && !news.length) continue; // already folded
        const he = head.entry, box = trip.site === "pad" ? "pad" : head.cid;
        const pad = trip.site === "pad" ? trip.members.map((p) => padName(txt(p.post))).find(Boolean) : null;
        const headText = trip.site === "pad" && LIFT.test(txt(head.post)) ? `${vehName(v)} lifted on the chopsticks${pad ? " at " + pad : ""}.` : txt(head.post);
        const rows = [];
        for (const e of fold) {
          if (e !== he || !head.own) rows.push(rowOf(e));
          for (const u of e.updates || []) if (u && u.text && u !== head.post) rows.push(u);
        }
        const headUrls = new Set([head.post.url, ...((he.sources || []).map((s) => s && s.url))].filter(Boolean));
        for (const n of news) if (!headUrls.has(n.url)) rows.push(n);
        const updates = mergeMoves(rows.filter((r) => !(r.url && r.url === head.post.url)));
        // the trip keeps a picture Bernardo locked on any of its entries (keep_image), the headline's own first
        const lock = [he, ...fold].map((e) => e.media_override).find((m) => m && m.keep_image) || null;
        const folded = { ...he, ...(head.own ? {} : { at: head.post.at, date: head.post.date, url: head.post.url, src: head.post.src, x_post: undefined, media_override: undefined }),
          ...(lock ? { media_override: lock } : {}),
          text: headText, card_text: headText, x_text: headText, updates, trip_order: "chrono",
          test_trip: { vehicle: v, site: trip.site, box, pad: pad || null, start: new Date(trip.start).toISOString(), end: new Date(trip.end).toISOString(), returned: trip.returned, members: fold.map((e) => e.id), news: news.map((n) => sid(n.url)) } };
        if (trip.site === "pad") folded.pad_trip = folded.test_trip;
        const drop = new Set(fold);
        cats = cats.map((c) => ({ ...c, history: c.history.filter((h) => !drop.has(h)) }));
        const bc = cats.find((c) => c.id === box);
        if (bc) bc.history = [folded, ...bc.history].sort((a, b) => T(b) - T(a));
        changed = true;
      }
    }
    return changed ? { ...road, categories: cats } : road;
  }
  return { routeEvents, classify, placesIn, JUST_MS, DUP_MS, PAD_PLACES,
    tripKind, stepOf, tripsOf, postsOf, mergeMoves, applyToRoad, headlineOf, MERGE_H, TRIP_MAX_D, RETURN_TAIL_H };
});
