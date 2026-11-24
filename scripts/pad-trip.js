/* Test-site trips (app + Node, pure data: no fetch, no DOM). Exposed as PadTrip and TestTrip (same module).
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
   applyToRoad(road) returns a NEW road (input untouched). Fleet registry entries may carry `sources` (same-event posts):
   they become the row's merged list. road.trip_feed (or road.feed_items) supplies the extra news posts. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else { root.PadTrip = factory(); root.TestTrip = root.PadTrip; } })(typeof self !== "undefined" ? self : this, function () {
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
  function classify(t) {
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
        out.push({ cid: c.id, entry: h, post: h, own: true, ...classify(txt(h)) }); if (h.url) urls.add(h.url);
        for (const s of h.sources || []) if (s && s.url) urls.add(s.url);
        for (const u of h.updates || []) if (u && u.text) { out.push({ cid: c.id, entry: h, post: u, own: false, ...classify(txt(u)) }); if (u.url) urls.add(u.url); for (const m of u.merged || []) if (m && m.url) urls.add(m.url); }
      }
    }
    for (const f of (road && (road.trip_feed || road.feed_items)) || []) {
      if (!f || f.kind !== "news" || !f.body || !f.url || urls.has(f.url) || !names(f.body).includes(v)) continue;
      const c = classify(f.body); if (!c.kind) continue;
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
      const c = classify(txt(r));
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
    return out.sort((a, b) => T(a) - T(b)).map(({ _k, ...r }) => r);
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
  return { classify, tripsOf, postsOf, mergeMoves, applyToRoad, headlineOf, MERGE_H, TRIP_MAX_D, RETURN_TAIL_H };
});
