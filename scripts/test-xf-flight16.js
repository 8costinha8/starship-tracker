/* Offline: Flight 16 readiness in X-first — paging past one page (no 40-post stop), per-flight card cap,
   overflow kept for the next run, untagged road posts → review queue. No network, no pushes. */
const fs = require("fs"), os = require("os"), path = require("path");
const xf = require("./x-first.js"), cr = require("./check-road.js");
let fails = 0; const check = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fails++; };
const NOW = Date.parse("2026-10-30T12:00:00Z");
const users = [{ id: "1", username: "LabPadre", name: "LabPadre" }];
const mk = (n) => ({ id: String(5000 + n), author_id: "1", created_at: new Date(NOW - (200 - n) * 60000).toISOString(), text: `post #${5000 + n}` });
const all = Array.from({ length: 130 }, (_, i) => mk(i + 1)).reverse(); // newest first, like X
const urls = [];
const fetchFn = async (u) => { const url = new URL(u); urls.push(url); const tok = url.searchParams.get("next_token"); const start = tok ? +tok : 0, size = +url.searchParams.get("max_results");
  const page = all.slice(start, start + size); const next = start + size < all.length ? String(start + size) : undefined;
  return { ok: true, status: 200, json: async () => ({ data: page, includes: { users }, meta: { ...(start ? {} : { newest_id: all[0].id }), ...(next ? { next_token: next } : {}) } }) }; };
// verdicts by post number: 5001-5008 Flight 15 road (B22), 5009-5016 Flight 16 road (B23, flight 16), 5017 untagged road post, others skip
const verdictFor = (id) => { const n = 5131 - +id; // 1 = newest
  if (n <= 8) return { kind: "road", stage: "pad", hardware: `Tank ${n}`, text: `Tank farm item ${n} moved.`, flight: null };
  if (n <= 16) return { kind: "road", stage: "pad", hardware: `Tank ${n}`, text: `Tank farm item ${n} moved.`, flight: 16 };
  if (n === 17) return { kind: "road", stage: "pad", hardware: null, text: "Something rolled out.", flight: null };
  return { kind: "skip", reason: "x" }; };
const ask = async (prompt) => ({ entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\d+)/gm)].map((m) => ({ item: +m[1], stage: null, hardware: null, text: null, reason: "x", ...verdictFor(m[2]) })) });
(async () => {
  const road = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
  const logs = [], log = (m) => logs.push(m);
  // 1. paging
  const got = await xf.fetchNewPosts({ token: "fake", sinceId: "4000", fetchFn, postCard: cr.xPostCard });
  check(got.posts.length === 130 && got.calls === 2 && urls[1].searchParams.get("next_token") === "100", `pages with next_token: 130 posts over ${got.calls} calls (old code stopped at 40)`);
  check(got.sinceId === all[0].id, "since_id is the newest id from the first page");
  // 2. run: 40 classified now, the other 90 wait (not dropped)
  urls.length = 0;
  const r = await xf.runXFirst(road, { xFirst: { sinceId: "4000", seen: [] } }, { token: "fake", fetchFn, ask, postCard: cr.xPostCard, log, now: NOW, maxCards: 5 });
  const inRun = new Set(r.cards.map((c) => c.post.post_id).concat(r.merged.map((c) => c.post.post_id)));
  const pend = new Set(r.state.pending.map((p) => p.post_id));
  check(pend.size >= 90 && all.every((p) => inRun.has(p.id) || pend.has(p.id) || r.state.seen.includes(p.id)), `nothing dropped: ${pend.size} post(s) carried to the next run`);
  // 3. per-flight cap: Flight 16 cards don't eat Flight 15's 5
  const byFlight = (f) => r.cards.filter((c) => (Number.isInteger(c.entry.flight) ? c.entry.flight : road.flight) === f).length;
  check(byFlight(road.flight) === 5 && byFlight(16) === 5, `cap is per flight (Flight ${road.flight}: ${byFlight(road.flight)}, Flight 16: ${byFlight(16)}, merged ${r.merged.length})`);
  check(!/cards\.length \+ missions\.length >= maxCards/.test(fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8")), "no shared cap across flights left in x-first.js");
  // 4. untagged → review queue file
  check(r.review.length === 1 && r.review[0].post_id === "5114" && !r.cards.some((c) => c.post.post_id === "5114"), "untagged road post → review queue, no card");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rq-")), f = path.join(tmp, "review-queue.json");
  check(cr.addToReview(f, r.review, NOW) === 1 && cr.addToReview(f, r.review, NOW) === 0, "review-queue.json: added once, not duplicated");
  const q = JSON.parse(fs.readFileSync(f, "utf8"));
  check(q.items[0].url && q.items[0].reason && q.items[0].queued, "queue item has link, reason and time");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All Flight 16 readiness checks passed."); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
