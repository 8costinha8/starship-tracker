// Offline regression tests: Road guards (25 Oct 2026 B22 "cryo" push during its static fire campaign).
// No network, fake X + fake writer, nothing pushed.
const xf = require("./x-first.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const POST = "Frost is forming on B22's lox tank! https://t.co/PgOnR4GXa9"; // @Blobifie 2114339995121332263, 25 Oct 2026 12:55 UK
const GROK = { kind: "road", stage: "cryo", hardware: "B22", event: "cryo_test", phase: "progress", status: "progress", flight: 15, media_fit: "shows-event", speculative: false, inferred: false,
  text: "Frost forming on Booster 22 LOX tank.", log_text: "Booster 22 undergoing cryo tests at the launch site.", reason: "frost on LOX tank = cryo" }; // what Grok returned
const fixture = () => ({ flight: 15, vehicles: ["B22", "S42"], categories: [
  { id: "cryo", name: "Cryo tests", status: "done", latest: "Ship 42 completed its cryo tests at Massey's.", history: [
    { id: "b22-cryo", date: "9–10 Sep", text: "Booster 22 completed its cryo test at Massey's.", hardware: "B22", trust: "trusted", milestone: { key: "cryo_test|15|B22", type: "cryo_test", flight: 15, hardware: "B22", phase: "completed" }, complete: true }] },
  { id: "static", name: "Static fires", status: "progress", latest: "x", history: [
    { id: "x-sf", date: "25 Oct", at: "2026-10-25T12:37:01.000Z", text: "Booster 22 transport ring relocated ahead of static fire test.", hardware: "B22", trust: "trusted", x_first: true }] },
  { id: "pad", name: "Pad", status: "complete", history: [] }] });
const card = (id, user, text) => ({ id, author_id: "1", created_at: "2026-10-25T12:55:12.000Z", text });
const run = async (road, posts, verdicts, user = "Blobifie") => {
  const logs = [], statuses = [];
  const fetchFn = async () => ({ ok: true, json: async () => ({ data: posts, meta: { newest_id: posts[posts.length - 1].id }, includes: { users: [{ id: "1", username: user, name: user }] } }) });
  const postCard = (p) => ({ post_id: p.id, url: `https://x.com/${user}/status/${p.id}`, created_at: p.created_at, text: p.text, author: { username: user, name: user }, media: [] });
  const r = await xf.runXFirst(road, { xFirst: { sinceId: "1" } }, { token: "fake", fetchFn, postCard, ask: async () => ({ entries: verdicts.map((v, i) => ({ item: i + 1, ...v })) }), log: (m) => logs.push(m), now: Date.parse("2026-10-25T13:00:00Z"),
    status: (box, s) => { statuses.push([box.id, s]); return { from: box.status, to: s }; } });
  return { r, logs, statuses };
};
(async () => {
  // 1. the exact 25 Oct post: no cryo card, no cryo status change, no push
  let road = fixture(); let { r, logs, statuses } = await run(road, [card("2114339995121332263", "Blobifie", POST)], [GROK]);
  const cryo = road.categories.find((c) => c.id === "cryo");
  check(cryo.history.length === 1 && cryo.status === "done" && !statuses.some(([id]) => id === "cryo"), "exact B22 frost/LOX post: no new cryo card and cryo stays Done");
  check(!r.cards.concat(r.merged).some((x) => x.box.id === "cryo"), "exact B22 frost/LOX post: nothing to push for cryo");
  check(logs.some((l) => /re-staged .* cryo → static/.test(l)), "propellant load / frost during static fire is re-staged to static fire, not cryo");
  check(r.cards.concat(r.merged).every((x) => x.box.id === "static"), "the post lands (if at all) on the static fire section");
  // 1b. live state on 25 Oct: B22 static fire already completed → no card, no push at all
  road = fixture(); road.categories[1].history.unshift({ id: "x-sfdone", at: "2026-10-25T12:11:58.000Z", text: "Booster 22 conducts a static fire test at Pad 2.", hardware: "B22", trust: "trusted", milestone: { key: "static_fire|15|B22", type: "static_fire", flight: 15, hardware: "B22", phase: "completed" }, complete: true });
  ({ r, logs } = await run(road, [card("2114339995121332263", "Blobifie", POST)], [GROK]));
  check(r.cards.length === 0 && r.merged.length === 0 && logs.some((l) => /guard skipped/.test(l)), "with B22's static fire already completed (Tier 2 source) → no card and no push");
  const g = xf.guardPost(fixture(), { text: POST, author: { username: "Blobifie" } }, GROK);
  check(!g.v || g.v.stage === "static", "guardPost never returns a cryo verdict for the exact post");
  // 2. chill-down on a vehicle that has NOT done cryo and has no static campaign stays as classified
  const fresh = fixture(); fresh.categories[0].history = []; fresh.categories[1].history = [];
  const g2 = xf.guardPost(fresh, { text: "Frost forming on S43's lox tank at Massey's during cryo!", author: { username: "Blobifie" } }, { ...GROK, hardware: "S43", flight: 16 });
  check(g2.v && g2.v.stage === "cryo", "real cryo post (explicit cryo / Massey's) on a vehicle not yet tested is kept as cryo");
  // 3. completed section: Tier 2 "B22 back in cryo" → skipped; Tier 1 explicitly "new cryo test" → allowed
  const t2 = xf.guardPost(fixture(), { text: "Booster 22 is doing cryo testing.", author: { username: "Blobifie" } }, { ...GROK, text: "Booster 22 doing cryo testing." });
  check(!!t2.skip, "Tier 2 post about a section the vehicle already completed → no card/push");
  const t1 = xf.guardPost(fixture(), { text: "Booster 22 is back at Massey's for another cryo test.", author: { username: "SpaceX" } }, { ...GROK, text: "Booster 22 back for another cryo test." });
  check(t1.v && !t1.skip && t1.v.stage === "cryo", "Tier 1 post explicitly saying a new cryo test re-opens it");
  const t1b = xf.guardPost(fixture(), { text: "Booster 22 is in cryo.", author: { username: "SpaceX" } }, GROK);
  check(!!t1b.skip, "Tier 1 without explicit 'new test' wording still doesn't re-open a completed section");
  // 4. vehicle and event must be in the same sentence (Ship 43 cryo story mentioning B22)
  const mix = xf.guardPost(fresh, { text: "B22 is on Pad 2. Meanwhile Ship 43 is heading to Massey's for cryo testing.", author: { username: "Blobifie" } }, { ...GROK, text: "Booster 22 cryo testing." });
  check(!!mix.skip && /same sentence/.test(mix.skip), "vehicle and event from different sentences → skipped (no B22 cryo from a Ship 43 story)");
  const same = xf.guardPost(fresh, { text: "Ship 43 is heading to Massey's for cryo testing.", author: { username: "Blobifie" } }, { ...GROK, hardware: "S43", flight: 16, text: "Ship 43 heads to Massey's for cryo testing." });
  check(same.v && !same.skip, "vehicle + event in one sentence passes");
  // 5. re-report of a completion still merges (no new open entry)
  const rr = xf.guardPost(fixture(), { text: "Booster 22 completed its cryo test.", author: { username: "Blobifie" } }, { ...GROK, phase: "completed", status: "done" });
  check(rr.v && !rr.skip, "a re-report of the same completion is not blocked (merges as before)");
  // 6. scripts/guards.js (runs before every road.json write) — real past cases from the committed f403a17 road.json
  {
    const G = require("./guards.js"), cp = require("child_process");
    const base = () => JSON.parse(cp.execSync("git show f403a17:road.json", { cwd: require("path").join(__dirname, ".."), encoding: "utf8" }));
    const logs = [], run = (r, o = {}) => G.run(r, { log: (m) => logs.push(m), ...o });
    // map: B22/S42 → 15, B23/S43 → 16, from the data
    let r = base(); run(r);
    check(JSON.stringify(r.hardware_flights) === JSON.stringify({ B22: 15, S42: 15, B23: 16, S43: 16 }), "hardware → flight map from data: B22/S42 = 15, B23/S43 = 16");
    // live leak (30 Oct): B23 'returned to Megabay 1' feed item filed to Flight 15 Cryo; Cryo headline from the B23 card
    const leak = r.feed_items.find((f) => /Booster 23 has returned/.test(f.body || ""));
    check(!leak || leak.flight === 16, "B23 feed item re-tagged to Flight 16 (cross-flight)");
    check(!/Booster 23|Ship 43/.test(r.categories.find((c) => c.id === "cryo").latest), "Flight 15 Cryo headline is a Flight 15 line, not B23/S43");
    check(logs.some((l) => /^GUARD (cross-flight|headline)/.test(l)), "fixes logged as GUARD");
    // mapping error: a B23 card tagged Flight 15 → 16
    r = base(); const b23 = r.categories.find((c) => c.id === "cryo").history.find((h) => h.hardware === "B23"); b23.flight = 15; run(r);
    check(b23.flight === 16, "B23 card tagged Flight 15 → re-tagged 16 (mapping)");
    // event record: B22 cryo (Blobifie 10 Sep 08:02 BST) – an edit changing text/day is put back
    r = base(); r = JSON.parse(JSON.stringify(require("../road.json"))); const ev = r.categories.flatMap((c) => c.history).find((h) => h.event_record);
    const prev0 = JSON.parse(JSON.stringify(r)); ev.date = "9 Sep"; ev.text = "Booster 22 cryo testing."; run(r, { prev: prev0 });
    check(ev.date === "10 Sep" && ev.text === "Booster 22 completed its first full cryo test.", "same event with another time/text → back to its event record");
    // recap: a new card for a post already on a card (Blobifie recap of the B22 cryo)
    r = base(); let prev = JSON.parse(JSON.stringify(r)); const cryo = r.categories.find((c) => c.id === "cryo");
    const old = cryo.history.find((h) => h.x_post && h.x_post.post_id);
    if (old) { cryo.history.unshift({ id: "e-recap", text: "Recap: B22 cryo done.", hardware: "B22", flight: 15, x_post: { post_id: old.x_post.post_id } }); const g = run(r, { prev });
      check(!cryo.history.some((h) => h.id === "e-recap") && g.dropped.has("e-recap"), "recap/edit of an existing post → no new card, push dropped"); }
    // untagged → review queue
    r = base(); prev = JSON.parse(JSON.stringify(r)); const q = []; r.categories.find((c) => c.id === "cryo").history.unshift({ id: "e-unt", text: "Cryo testing tonight at Massey's.", src: "@LabPadre" });
    run(r, { prev, review: q }); check(q.length === 1 && !r.categories.find((c) => c.id === "cryo").history.some((h) => h.id === "e-unt"), "untagged cryo post → review queue, no card");
    // per-flight cap
    r = base(); prev = JSON.parse(JSON.stringify(r)); const st = r.categories.find((c) => c.id === "static");
    for (let i = 0; i < G.CAP + 2; i++) st.history.unshift({ id: `e-cap${i}`, text: `Ship 42 static fire update ${i}.`, hardware: "S42", flight: 15 });
    const gc = run(r, { prev }); check(gc.dropped.size === 2, `more than ${G.CAP} new Flight 15 cards in one update → extras wait`);
    // hedged completion (25 Oct B22 "appears to have completed")
    r = base(); prev = JSON.parse(JSON.stringify(r)); const hc = { id: "e-hedge", text: "Booster 22 appears to have completed another cryo test.", hardware: "B22", flight: 15, complete: true, milestone: { phase: "completed" } };
    r.categories.find((c) => c.id === "cryo").history.unshift(hc); run(r, { prev }); check(!hc.complete && hc.milestone.phase !== "completed", "hedged completion wording → not complete");
    // rollover: empty vehicles → from the map
    r = base(); r.vehicles = []; run(r); check(JSON.stringify(r.vehicles) === JSON.stringify(["B22", "S42"]), "rollover with no vehicles → vehicles from the flight map");
    // missed date slip (29 Oct: NET 8 Nov → 12 Nov with no push) + two-digit day
    const P = require("./predicted.js"), PS = require("./push-sync.js");
    r = base(); prev = JSON.parse(JSON.stringify(r)); prev.predicted = { ...(r.predicted || {}), flight: 15, net: "2026-11-08" }; r.predicted = { ...prev.predicted, net: "2026-11-12" }; r.feed_items = (r.feed_items || []).filter((f) => f.kind !== "launch_date"); // as on 29 Oct, before the slip was sent by hand
    const gs = run(r, { prev, slipPush: P.slipPush, addFeedItem: PS.addFeedItem, now: Date.parse("2026-10-29T12:00:00Z") });
    check(gs.pushes.length === 1 && /NET 12 Nov \(was 8 Nov\) · unofficial/.test(gs.pushes[0].body || ""), "missed estimate slip → feed item + push 'NET 12 Nov (was 8 Nov) · unofficial'");
    const gs2 = run(r, { prev, slipPush: P.slipPush, addFeedItem: PS.addFeedItem }); check(gs2.pushes.length === 0, "slip already in the feed → no second push");
    check("NET 12 Nov".match(G.NET_DAY)[1] === "12", "date pattern reads two-digit days");
    // later-flight (31 Oct 02:09 GMT): efraser77 'Booster 24 methane tank lifted inside Megabay 1' filed as Flight 15 Static fires
    const B24 = { id: "news-mvvriszs-0c1ff5", kind: "news", title: "🚀 Starship", body: "Booster 24 methane tank lifted inside Megabay 1 this evening", url: "https://x.com/efraser77/status/2116351708150497473", at: "2026-10-31T02:09:01.000Z", date: "31 Oct", flight: 15, box: "static" };
    r = base(); prev = JSON.parse(JSON.stringify(r)); r.feed_items = [{ ...B24 }, ...(r.feed_items || [])]; logs.length = 0;
    const gb = run(r, { prev }); const fb = r.feed_items.find((f) => f.id === B24.id);
    check(fb.flight !== 15 && fb.flight === 17, "exact B24 item (efraser77) → not Flight 15 (Flight 17)");
    check(!fb.box && !r.categories.some((c) => (c.history || []).some((h) => /Booster 24/.test(h.text || "") || (h.updates || []).some((u) => /Booster 24/.test(u.text || "")))), "exact B24 item → no box, no Road card / Earlier-updates row");
    check(gb.dropped.has(B24.id) && !gb.pushes.length, "exact B24 item → no push");
    check(logs.some((l) => /^GUARD later-flight: news-mvvriszs-0c1ff5/.test(l)), "B24 fix logged as GUARD later-flight");
    check(G.flightMap(r).B24 === undefined && r.vehicles.every((v) => v !== "B24"), "B24 does not enter the tracked flight's map");
    // unknown higher ship number as a card on the Flight 15 Road → review queue, no card, no push
    r = base(); prev = JSON.parse(JSON.stringify(r)); const rq = []; const st2 = r.categories.find((c) => c.id === "static");
    st2.history.unshift({ id: "e-s44", text: "Ship 44 static fire at Massey's.", hardware: "S44", src: "@efraser77" });
    const g44 = run(r, { prev, review: rq });
    check(!st2.history.some((h) => h.id === "e-s44") && rq.length === 1 && /Flight 17/.test(rq[0].suggested) && g44.dropped.has("e-s44"), "unknown S44 card → review queue (suggested Flight 17), no Flight 15 card, no push");
    r = base(); r.feed_items = [{ ...B24, id: "news-s44", body: "S44 nosecone stacked", box: "cryo" }, ...(r.feed_items || [])]; run(r);
    const f44 = r.feed_items.find((f) => f.id === "news-s44"); check(f44.flight === 17 && !f44.box, "unknown S44 feed item → Flight 17, no box");
  }
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All guard checks passed."); process.exit(fails ? 1 : 0);
})();
