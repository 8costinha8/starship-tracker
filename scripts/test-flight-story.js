/* Flight story photos (scripts/flight-story.js), offline, no pushes.
   F15 replay: the REAL @SpaceX posts of 12-22 Nov (fixtures/story/x-spacex-2026-11-12-22.json) through the pipeline must
   reproduce Tusk's curated set (images/f15-story/, fixtures/story/f15-curated.json): same 10 slots in the same order,
   same source post per slot, catch first. Within-post photo choice = Grok's job; offline the curated answers stand in.
   Then generic synthetic flights: hero priority, source priority, never padding, size flag, window + replacement. */
const fs = require("fs"), path = require("path");
const S = require("./flight-story.js"), { cardsFrom, backfill } = require("./flight-story-backfill.js");
const { appFns } = require("./app-fns-test-helper.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const ok = (c, m) => { console.log((c ? "✅ " : "❌ ") + m); if (!c) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const cur = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "story", "f15-curated.json"), "utf8"));
const posts = cardsFrom(JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "story", "x-spacex-2026-11-12-22.json"), "utf8")));
const road0 = () => JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const blank = () => { const r = road0(); delete r.archive[15].story_photos; return r; };
(async () => {
  // ── F15 replay (no writes: a fresh store, the road kept in memory)
  const road = blank();
  const { st, res } = await backfill({ posts, road, appJsText: app, curated: cur, st: { version: 1, flights: {}, cache: {} }, now: Date.parse("2026-11-23T16:00Z"), log: () => {} });
  const got = road.archive[15].story_photos || [];
  ok(got.length === 10, `F15: ${got.length} story photos`);
  ok(JSON.stringify(got.map((p) => p.slot)) === JSON.stringify(cur.slots.map((s) => s.slot)), `slot order = curated: ${got.map((p) => p.slot).join(" › ")}`);
  ok(got.every((p, i) => p.source_post === cur.slots[i].source_post), "every slot comes from the curated source post");
  ok(got.every((p, i) => p.src === cur.slots[i].file), "every picture = the curated file (images/f15-story/, reused from the image cache, nothing downloaded)");
  ok(got[0].slot === "hero" && /2123097995679867195/.test(got[0].source_post), "hero = the ship catch (first caught Starship), first in the carousel");
  ok(got.every((p) => p.credit === "SpaceX" && p.author === "SpaceX" && /^https:\/\/x\.com\/SpaceX\/status\/\d+$/.test(p.source_post)), "credit + source link on every photo");
  ok(got.filter((p) => p.kind === "photo").every((p) => /name=orig$/.test(p.source_url)), "photo sources are the original-resolution X URLs (name=orig)");
  ok(got.find((p) => p.slot === "reentry").small === true && got.filter((p) => p.small).length === 1, "the 900 px reentry frame is flagged small (largest available); the rest are >= 1600 px");
  ok(st.flights[15].frozen === true && Date.parse(st.flights[15].window.to) - Date.parse(st.flights[15].window.last) === S.WINDOW_AFTER_MS, `window ${st.flights[15].window.from} → ${st.flights[15].window.to} (last event + 7 days), now closed: frozen`);
  ok(Date.parse(st.flights[15].window.from) === Date.parse("2026-11-13T00:56:49.000Z"), "window opens at the rollout post (Ship 42 moves to the pad, 13 Nov 00:56)");
  // without Grok: the same post per slot (post-level decisions are deterministic)
  const r2 = blank(), st2 = { version: 1, flights: {}, cache: { ...st.cache } };
  S.ingest(st2, posts, S.ctxFrom({ road: r2, appJsText: app }));
  const pl = S.plan(st2.flights[15], S.flightsFrom(app).find((f) => f.n === 15));
  ok(pl.picks.map((p) => p.post.url).join() === cur.slots.map((s) => s.source_post).join(), "without Grok the same 10 source posts are chosen (only the photo inside a multi-photo post can differ)");
  ok(!Object.values(st2.flights[15].posts).some((p) => /Falcon|NROL|USSF|Dragon|Boca Chica Beach|supercompute|docuseries/i.test(p.text)), "non-Starship SpaceX posts never enter the pool");
  ok(!Object.values(st2.flights[15].posts).some((p) => /^On Friday, November 13/.test(p.text) || /Live views/.test(p.text)), "recap and livestream posts never enter the pool");
  // app: cardPhotosOf reads story_photos first; identical to the live curated carousel; falls back without it
  const appChecks = appFns(["cardPhotosOf", "FLIGHTS", "pastRoadGroup", "pastCondensed", "ROAD_HIDDEN", "thumbOf"], (F) => { const out = []; const ok = (c, m) => out.push([c, m]);
    const f15 = F.FLIGHTS.find((x) => x.n === 15), group = F.pastRoadGroup(road, 15, F.FLIGHTS, F.ROAD_HIDDEN), past = F.pastCondensed(group);
    const withStory = F.cardPhotosOf(f15, past, road).map((p) => p.src), live = F.cardPhotosOf(f15, past, blank()).map((p) => p.src);
    ok(JSON.stringify(withStory) === JSON.stringify(live) && withStory.length === 10, "F15 card: story_photos carousel is identical to today's curated carousel (same 10 files, same order)");
    ok(F.thumbOf(f15, past, road) === "images/f15-story/01-hero-ship-caught.jpg", "F15 thumb = story hero (unchanged)");
    const f14 = F.FLIGHTS.find((x) => x.n === 14), g14 = F.pastRoadGroup(road, 14, F.FLIGHTS, F.ROAD_HIDDEN), p14 = F.pastCondensed(g14);
    ok(JSON.stringify(F.cardPhotosOf(f14, p14, road)) === JSON.stringify(F.cardPhotosOf(f14, p14, blank())), "a flight without story_photos keeps the old behaviour (F14)");
    const rx = blank(); rx.archive[14] = { ...(rx.archive[14] || {}), story_photos: [{ slot: "hero", src: "images/story/f14/x.jpg", credit: "SpaceX" }, { slot: "liftoff", src: "images/story/f14/y.jpg", credit: "SpaceX" }] };
    const c14 = F.cardPhotosOf(f14, p14, rx);
    ok(c14.length === 2 && c14[0].src === "images/story/f14/x.jpg" && c14[0].credit === "SpaceX", "a flight with story_photos shows them first, hero first, with credit");
  return out; });
  for (const [c, m] of appChecks) ok(c, m);

  // ── synthetic flight (generic: nothing about F15 in code). Flight 31 launched 1 Mar 2027.
  const T = Date.parse("2027-03-01T12:00:00Z"), iso = (h) => new Date(T + h * 3600000).toISOString();
  const appX = `const FLIGHTS = [\n  { n: 31, date: "${new Date(T).toISOString()}", booster: "B40", ship: "S60" },\n];`;
  const ph = (id, w = 4096, h = 2304) => ({ type: "photo", url: `https://pbs.twimg.com/media/P${id}.jpg`, w, h });
  const vid = (id) => ({ type: "video", poster: `https://pbs.twimg.com/amplify_video_thumb/${id}/img/x.jpg`, video_url: `https://video.twimg.com/${id}.mp4`, w: 3840, h: 2160 });
  const P = (id, who, h, text, media) => ({ post_id: String(id), url: `https://x.com/${who}/status/${id}`, created_at: iso(h), text, author: { username: who }, media });
  const run = (list, now = T + 30 * 86400000) => { const st = { version: 1, flights: {}, cache: {} }, ctx = S.ctxFrom({ road: { flight: 31 }, appJsText: appX }); S.ingest(st, list, ctx); return { st, pl: st.flights[31] ? S.plan(st.flights[31], S.flightsFrom(appX)[0], { now }) : { picks: [] } }; };
  const base = [
    P(1, "SpaceX", -30, "Ship 60 rolls out to the pad ahead of Flight 31", [ph(1)]),
    P(2, "SpaceX", 0.2, "Liftoff of Starship Flight 31", [ph(2), ph(3)]),
    P(3, "SpaceX", 0.3, "Super Heavy Booster 40 landing burn and splashdown in the Gulf", [ph(4)]),
  ];
  let r = run(base);
  ok(r.pl.picks.map((p) => p.slot).join() === "hero,rollout,liftoff,ascent", `3 posts (4 photos; the booster splashdown photo is the hero) → ${r.pl.picks.length} photos, empty slots skipped, never padded (${r.pl.picks.map((p) => p.slot).join(", ")})`);
  ok(r.pl.picks[0].beat === "splashdown" && /status\/3$/.test(r.pl.picks[0].post.url), "hero: no catch → splashdown beats liftoff");
  r = run([...base, P(4, "SpaceX", 1.5, "Mechazilla catches Super Heavy Booster 40!", [ph(5)])]);
  ok(r.pl.picks[0].beat === "booster_catch", "hero: booster catch beats splashdown");
  r = run([...base, P(4, "SpaceX", 1.5, "Mechazilla catches Super Heavy Booster 40!", [ph(5)]), P(5, "SpaceX", 26, "Mechazilla catches Starship!", [ph(6)])]);
  ok(r.pl.picks[0].beat === "ship_catch" && /status\/5$/.test(r.pl.picks[0].post.url), "hero: ship catch beats booster catch");
  r = run([P(2, "SpaceX", 0.2, "Liftoff of Starship Flight 31", [ph(2)])]);
  ok(r.pl.picks[0].slot === "hero" && r.pl.picks[0].beat === "liftoff" && r.pl.picks.length === 1, "hero: liftoff when that is all there is; its photo is not reused in the liftoff slot (no padding)");
  // source priority: SpaceX photo > SpaceX frame > tier-1 photo > tier-2 photo
  const hs = (who, id, m, h = 0.05) => P(id, who, h, "Hot staging on Starship Flight 31!", [m]);
  const slotPost = (list) => (run(list).pl.picks.find((p) => p.slot === "hot_staging") || { post: {} }).post.url || "";
  ok(/RGVaerialphotos/.test(slotPost([hs("RGVaerialphotos", 10, ph(10))])), "tier-2 photo used when nothing better exists");
  ok(/NASASpaceflight/.test(slotPost([hs("RGVaerialphotos", 10, ph(10)), hs("NASASpaceflight", 11, ph(11))])), "tier-1 outlet photo beats tier-2");
  ok(/SpaceX\/status\/12/.test(slotPost([hs("NASASpaceflight", 11, ph(11)), hs("SpaceX", 12, vid(12))])), "SpaceX video frame beats outlet photos");
  ok(/SpaceX\/status\/13/.test(slotPost([hs("SpaceX", 12, vid(12)), hs("SpaceX", 13, ph(13))])), "SpaceX photo beats SpaceX video frame");
  // size + landscape
  r = run([P(2, "SpaceX", 0.2, "Liftoff of Starship Flight 31", [ph(20, 1200, 800)])]);
  ok(r.pl.picks[0].small === true, "only a 1200 px photo → used (largest available) and flagged small");
  r = run([P(2, "SpaceX", 0.2, "Liftoff of Starship Flight 31", [ph(21, 2304, 4096), ph(22, 4096, 2304)])]);
  ok(/P22/.test(r.pl.picks[0].pic.url), "landscape photo preferred over portrait");
  ok(/name=orig$/.test(r.pl.picks[0].pic.url), "photo picked at original resolution (name=orig)");
  // window: after last event + 7 days → ignored; tier-2 post without an explicit flight/vehicle → ignored
  r = run([...base, P(6, "SpaceX", 24 * 9, "Starship Flight 31 team with Ship 60 after the flight", [ph(30)])]);
  ok(!r.pl.picks.some((p) => /status\/6$/.test(p.post.url)), "a post after the window (last event + 7 days) is not used");
  r = run([...base, P(7, "SpaceX", 24 * 3, "The Starship team with Ship 60 after the flight", [ph(31)])]);
  ok(r.pl.picks.some((p) => p.slot === "aftermath" && /status\/7$/.test(p.post.url)), "aftermath: a team photo inside the window closes the story");
  r = run([P(8, "BocaChicaGal", 0.2, "Liftoff!", [ph(32)])]);
  ok(!r.pl.picks.length, "a tracker post with no Starship / flight / vehicle mention is never guessed into a flight");
  // replacement while the window is open, frozen after (build with a stub materialiser: no downloads)
  const mat = async (pk, n, i, { st }) => (st.cache[pk.key] = st.cache[pk.key] || { file: `images/story/f${n}/${i}-${pk.slot}.jpg`, w: pk.pic.w, h: pk.pic.h });
  const sx = { version: 1, flights: {}, cache: {} }, rd = { flight: 32, archive: {} }, ctx = S.ctxFrom({ road: rd, appJsText: appX });
  S.ingest(sx, [P(40, "RGVaerialphotos", 0.2, "Liftoff of Starship Flight 31", [ph(40)])], ctx);
  await S.build(sx, rd, { appJsText: appX, now: T + 86400000, materialiseFn: mat });
  ok(rd.archive[31].story_photos[0].author === "RGVaerialphotos", "day 1: tracker photo as hero");
  S.ingest(sx, [P(41, "SpaceX", 0.3, "Liftoff of Starship Flight 31", [ph(41)])], ctx);
  await S.build(sx, rd, { appJsText: appX, now: T + 3 * 86400000, materialiseFn: mat });
  ok(rd.archive[31].story_photos[0].author === "SpaceX", "day 3 (window open): SpaceX's photo replaces it");
  await S.build(sx, rd, { appJsText: appX, now: T + 9 * 86400000, materialiseFn: mat });
  ok(sx.flights[31].frozen === true, "after last event + 7 days the set is frozen");
  S.ingest(sx, [P(42, "SpaceX", 24 * 8.5, "Liftoff of Starship Flight 31 — new angle", [ph(42, 8000, 4500)])], ctx);
  const before = JSON.stringify(rd.archive[31].story_photos);
  await S.build(sx, rd, { appJsText: appX, now: T + 10 * 86400000, materialiseFn: mat });
  ok(JSON.stringify(rd.archive[31].story_photos) === before && !sx.flights[31].posts["42"], "frozen: later posts change nothing");
  // screen-grab / split-screen frames
  const W = 160, H = 90, img = (f) => { const b = Buffer.alloc(W * H * 3); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b.set(f(x, y), (y * W + x) * 3); return b; };
  ok(S.panelLayout(img((x, y) => (y < 10 || y > 79 ? [0, 0, 0] : [90, 120, 200]))), "webcast split-screen (black bands top + bottom) is rejected");
  ok(!S.panelLayout(img((x, y) => [90, 120, 200 - y])), "a full-frame view is kept");
  console.log(fails ? `\n❌ ${fails} check(s) failed` : "\n✅ all checks passed"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.log("❌ crashed: " + e.stack); process.exit(1); });
