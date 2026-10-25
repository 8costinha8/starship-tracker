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
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All guard checks passed."); process.exit(fails ? 1 : 0);
})();
