/* Fleet plumbing: subscriber cleanup (no delete on one failed send), delivery counts on the push log row, fleet entries
   count as "visible", push-gate no-hold for first-of-a-kind test milestones (rollouts keep the hold), cryo regex,
   6-hourly coverage (one X call, gated, gaps → health), screen-grab picture check. Offline; fake fetch; stub sender. */
const { F, ps, ok, done, appJsText, road0, post } = require("./fleet-test-helpers.js");
const fcm = require("./fcm-send.js"), gate = require("./push-gate.js"), pp = require("./push-policy.js"), guards = require("./push-guards.js");
(async () => {
  // 1. subscriber cleanup
  const pl = fcm.plan([{ success: true }, { success: false, error: { code: "messaging/internal-error" } }, { success: false, error: { code: "messaging/registration-token-not-registered" } }, { success: false, error: { code: "messaging/unavailable" } }],
    [{ id: "a", data: { fails: 2 } }, { id: "b", data: {} }, { id: "c", data: {} }, { id: "d", data: { fails: 2 } }]);
  ok(pl.success === 1 && pl.failure === 3, "plan counts 1 success / 3 failures");
  ok(pl.remove.sort().join() === "c,d", "removed only: dead token (c) and 3rd failure in a row (d)");
  ok(pl.bump.length === 1 && pl.bump[0].id === "b" && pl.bump[0].fails === 1, "a single transient failure keeps the subscriber (fails = 1)");
  ok(pl.reset.join() === "a", "a success resets the failure counter");
  const ops = [];
  const db = { collection: () => ({ get: async () => ({ docs: ["t1", "t2"].map((id) => ({ id, data: () => ({}) })) }), doc: (id) => ({ delete: async () => ops.push("del " + id), set: async (x) => ops.push("set " + id + " " + JSON.stringify(x)) }) }) };
  const admin = { messaging: () => ({ sendEachForMulticast: async (m) => ({ responses: m.tokens.map((t) => (t === "t1" ? { success: true } : { success: false, error: { code: "messaging/unavailable" } })) }) }) };
  const d = await fcm.sendToSubscribers({ admin, db, message: (tokens) => ({ tokens }), title: "x", log: () => {} });
  ok(d.tokens === 2 && d.success === 1 && d.failure === 1 && d.removed === 0 && !ops.some((o) => /^del/.test(o)) && ops.some((o) => /^set t2 .*"fails":1/.test(o)), `one failed send deletes nobody (${JSON.stringify(d)})`);
  // 2. delivery counts stored on the log row + fleet entry visible
  const road = road0(), reg = F.empty(); F.seed(reg, { road, appJsText, now: 0 });
  const r = F.ingest(reg, [post("9300000000000000001", "RGVaerialphotos", "2026-12-02T21:00:00.000Z", "Ship 47 began cryogenic proof testing at Massey's.")], { road, now: Date.parse("2026-12-02T21:10Z") });
  const n = r.pushes.find((x) => x.push).n, rows = [];
  ok(ps.checkVisible(road, n, reg) === "" && ps.checkVisible(road, n, F.empty()) !== "", "a fleet push is visible only when its registry entry exists");
  const row = await ps.sendPush({ ...n, link: "x" }, { road, fleet: reg, send: async () => ({ tokens: 5, success: 4, failure: 1, removed: 0, failed_codes: { "messaging/unavailable": 1 } }), logRows: rows, log: () => {}, now: () => Date.parse("2026-12-02T21:10Z"), history: [], gate: null, guards: true });
  ok(row && row.verdict === "sent" && row.delivery && row.delivery.tokens === 5 && row.delivery.success === 4 && row.delivery.failure === 1 && row.fleet_key === "S47|cryo_start", `log row has delivery counts ${JSON.stringify(row && row.delivery)}`);
  // 3. push-gate: first-of-a-kind cryo from a trusted tracker → no hold; rollout keeps the hold
  const now = Date.parse("2026-12-02T21:10Z");
  const g1 = await gate.evaluate({ ...n }, { history: [], state: {}, now, vehicles: [] });
  ok(g1.action === "send" && /no hold/.test(g1.reason), `gate: first cryo milestone sends without the one-run hold (${g1.reason})`);
  const g2 = await gate.evaluate({ ...n }, { history: [{ verdict: "sent", fleet_key: n.fleet_key }], state: {}, now, vehicles: [] });
  ok(g2.action === "hold", "gate: the same key after an earlier send is held as before");
  const g3 = await gate.evaluate({ title: "🚚 Booster 24 · rollout", body: "Booster 24 rolled out to the launch site.", url: "https://x.com/RGVaerialphotos/status/1", at: new Date(now).toISOString(), fleet_key: "B24|rollout" }, { history: [], state: {}, now, vehicles: [] });
  ok(g3.action === "hold", "gate: a rollout (location claim) keeps the one-run hold");
  // 4. cryo regex + guards
  ok(pp.classify({ body: "Booster 24 completed its first round of cryogenic proof testing at Massey's." }).type === "cryo_complete", "regex: 'completed its first round of cryogenic proof testing' = cryo complete");
  ok(pp.classify({ body: "Booster 24 is undergoing cryogenic proof testing." }).type !== "cryo_complete", "regex: 'undergoing' is not 'complete'");
  const gv = guards.evaluate({ ...n }, { history: [], now, road });
  ok(!(gv.flags || []).some((f) => /^G4|^G7/.test(f.id || f)), "guards G4 / G7 do not flag a fleet milestone of another flight");
  // 5. coverage: gated, one call, gaps → healed
  ok(F.coverageDue({ coverage: null }, now) && !F.coverageDue({ coverage: { at: new Date(now - 3600000).toISOString() } }, now) && F.coverageDue({ coverage: { at: new Date(now - 7 * 3600000).toISOString() } }, now), "coverage due when never run or ≥ 6 h old, not after 1 h");
  const q = F.coverageQuery(reg); ok(q.length <= 500 && /S47|Ship 47/.test(q) && /-is:retweet/.test(q), `query lists the tracked vehicles + test words, no retweets (trusted accounts filtered after) (${q.length} chars)`);
  let calls = 0; const fakeFetch = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: "9300000000000000009", text: "Ship 47 completed its cryo testing campaign at Massey's.", created_at: "2026-12-03T05:00:00.000Z", author_id: "u1" }], includes: { users: [{ id: "u1", username: "BocaChicaGal" }] } }) }; };
  const postCard = (p, m, u) => ({ post_id: p.id, url: `https://x.com/${u[p.author_id].username}/status/${p.id}`, created_at: p.created_at, text: p.text, author: { username: u[p.author_id].username }, media: [] });
  const cv = await F.runCoverage(reg, { token: "t", fetchFn: fakeFetch, road, postCard, now: Date.parse("2026-12-03T05:30Z") });
  ok(calls === 1 && cv.gaps.length === 1 && reg.coverage.ok && reg.coverage.calls === 1, "coverage: exactly one X call, the missed post is reported as a gap");
  ok(reg.vehicles.S47.events.some((e) => e.type === "cryo_done"), "coverage: the gap is added to the registry (self-heal)");
  const cv2 = await F.runCoverage(F.empty(), { token: "", fetchFn: fakeFetch, postCard }); ok(cv2.skipped && calls === 1, "coverage: no token → no call");
  // 6. screen-grab check (pixels): red ticker / dark lower-third rejected, plain scene kept
  const W = 160, H = 90, img = (f) => { const b = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(f(x, y), (y * W + x) * 3); return b; };
  ok(F.bannerOf(img((x, y) => (y >= 86 ? [200, 20, 30] : [120, 130, 140]))).banner, "pixels: red ticker band = screen grab");
  ok(F.bannerOf(img((x, y) => (y >= 84 ? [15, 15, 15] : [150, 150, 160]))).banner, "pixels: dark lower-third under a bright scene = screen grab");
  ok(!F.bannerOf(img((x, y) => [100 + (x % 30), 110, 120 - (y % 20)])).banner, "pixels: an ordinary scene is kept");
  const e = { candidates: [{ url: "grab", score: 3, type: "photo", post_url: "p1", author: "a", at: "2026-01-01" }, { url: "clean", score: 2, type: "video", post_url: "p2", author: "b", at: "2026-01-02" }] };
  const reg2 = { vehicles: { X: { events: [e] } } };
  await F.screenImages(reg2, { probe: (u) => ({ banner: u === "grab", why: "t" }) });
  ok(e.image && e.image.url === "clean" && e.image_src === "p2" && e.image_checked, "a rejected grab falls back to the next candidate of the same event");
  done();
})().catch((e) => { console.log("❌ crashed: " + e.stack); process.exit(1); });
