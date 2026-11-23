/* Scenario 1 — B24 replay (REAL posts, fixtures/fleet/x-posts-2026-11-16-23.json: X API v2 search of the trusted accounts,
   16-23 Nov 2026). The live path (one checker run per post) must give B24 / S44 events on Flight 17, B25 with no flight,
   exactly one push decision per vehicle + milestone (stub sender = dry run), and the F16 vehicles untouched.
   The backfill path over the same posts must give the same events and ZERO pushes; a new event after it still pushes once. */
const fs = require("fs"), path = require("path");
const { F, ps, ok, done, appJsText, road0, post, liveReplay, noProbe, ROOT } = require("./fleet-test-helpers.js");
const { cardsFrom } = require("./fleet-backfill.js");
const page = JSON.parse(fs.readFileSync(path.join(ROOT, "fixtures", "fleet", "x-posts-2026-11-16-23.json"), "utf8"));
const posts = cardsFrom(page);
(async () => {
  ok(posts.length === 33 && posts.every((p) => p.author.username), `fixture: ${posts.length} real posts with authors`);
  // ── live replay
  const road = road0(), reg = F.empty(); F.seed(reg, { road, appJsText, now: Date.parse("2026-11-16T15:00Z") });
  const { decisions, sent, history } = await liveReplay(reg, posts, road);
  const V = reg.vehicles, ev = (id, t) => (V[id] && V[id].events || []).find((e) => e.type === t);
  ok(V.B24 && V.B24.flight === 17 && V.S44 && V.S44.flight === 17, "B24 and S44 learned as Flight 17 from the posts (\"Starship Flight 17 - Ship 44 and Booster 24…\")");
  ok(V.B25 && V.B25.flight === null && V.B25.state === "build", "B25 added automatically, no flight yet, in build");
  ok(!V.S40.events.length && !V.S20, "older numbers (S40 flew Flight 13, S20 retired) never become new vehicles or events");
  ok(V.S42.flight === 15 && V.S42.state === "flight", "S42 (flew Flight 15) is not re-assigned by the hedged 'B24 and Ship 42 for Flight 17' post");
  const b24s = ev("B24", "cryo_start"), b24d = ev("B24", "cryo_done");
  ok(b24s && b24s.at === "2026-11-22T21:16:40.000Z" && /RGVaerialphotos\/status\/2124613056231817244/.test(b24s.url), `B24 cryo start = RGV 22 Nov 21:16 UK (${b24s && b24s.at})`);
  ok(b24d && b24d.at === "2026-11-23T07:22:05.000Z" && /first round of cryo testing/.test(b24d.text), `B24 cryo done = RGV 23 Nov 07:22 UK, "${b24d && b24d.text}"`);
  ok(b24s.sources.length >= 4 && b24d.sources.length === 2, `later posts of the same event are extra sources, not new events (${b24s.sources.length} / ${b24d.sources.length})`);
  ok(ev("B24", "move") && ev("B24", "move").place === "Massey's" && ev("B24", "move").at === "2026-11-20T06:05:11.000Z", "B24 headed to Massey's 20 Nov 06:05 UK (TrackingTheSB)");
  ok(ev("S44", "cryo_start") && ev("S44", "cryo_done") && ev("S44", "move"), "S44: to Massey's, cryo start, cryo done");
  ok(V.B24.state === "cryo" && V.S44.state === "cryo", "lifecycle: B24 / S44 → cryo");
  ok(!V.B23.events.length && !V.S43.events.length, "Flight 16 vehicles (B23 / S43) get no registry events from these posts (F15/F16 separation)");
  const pushes = decisions.filter((d) => d.push), keys = pushes.map((d) => d.key).sort();
  ok(JSON.stringify(keys) === JSON.stringify(["B24|cryo_done", "B24|cryo_start", "S44|cryo_done", "S44|cryo_start"]), `exactly one push decision per vehicle + milestone: ${keys.join(", ")}`);
  ok(sent.length === 4 && history.every((r) => r.verdict === "sent" && r.fleet_key && r.delivery && r.delivery.success === 1), "all 4 sent through sendPush (stub sender), visible in the registry, delivery counts on the log row");
  ok(decisions.filter((d) => !d.push && /already decided/.test(d.reason)).length === 0 && new Set(keys).size === keys.length, "no second decision for a key: later sources only add to the event");
  const t = sent.find((n) => n.fleet_key === "B24|cryo_done");
  ok(t && t.title === "❄️ Booster 24 · cryo test complete" && t.body === b24d.text && ps.checkVisible(road, t, reg) === "", `push title/body = the Page 2 card ("${t && t.title}" — "${t && t.body}")`);
  const pol = require("./push-policy.js").decide({ ...t }, history, { now: Date.parse("2026-11-23T08:00Z"), vehicles: road.vehicles });
  ok(!pol.push && /duplicate B24\|cryo_done/.test(pol.reason), "push-policy: the same key never pushes twice (any day)");
  const g = F.groups(reg, road);
  ok(g.get(17) && g.get(17).map((v) => v.id).sort().join() === "B24,S44" && g.get("unassigned").map((v) => v.id).join() === "B25", "Future vehicles groups: Flight 17 = B24, S44; no flight yet = B25");
  // ── backfill over the same posts: same events, zero pushes; a new event after it pushes once
  const { backfill } = require("./fleet-backfill.js");
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "fleet-bf-")), regPath = path.join(tmp, "vehicles.json");
  const bf = await backfill({ posts, road: road0(), appJsText, regPath, now: Date.parse("2026-11-23T15:40Z"), log: () => {}, probe: noProbe });
  ok(bf.res.pushes.length >= 4 && bf.res.pushes.every((p) => !p.push), `backfill: ${bf.res.pushes.length} milestone decision(s), 0 pushes`);
  const r2 = F.load(regPath);
  ok(Object.values(r2.vehicles).flatMap((v) => v.events).every((e) => e.backfill === true), "every backfilled event is flagged backfill");
  ok(["B24|cryo_start", "B24|cryo_done", "S44|cryo_start", "S44|cryo_done"].every((k) => r2.pushed[k] && /backfill/.test(r2.pushed[k].why)), "backfilled keys are pre-seeded: they can never push later");
  const again = F.ingest(r2, [post("9000000000000000001", "RGVaerialphotos", "2026-11-23T16:00:00.000Z", "Booster 24 completed its first round of cryogenic proof testing at Massey's.")], { road: road0(), now: Date.parse("2026-11-23T16:10Z") });
  ok(!again.pushes.some((p) => p.push), "a re-report of a backfilled milestone does not push");
  const fresh = F.ingest(r2, [post("9000000000000000002", "RGVaerialphotos", "2026-11-24T18:00:00.000Z", "Booster 24 completed a static fire at Massey's this evening.")], { road: road0(), now: Date.parse("2026-11-24T18:10Z") });
  ok(fresh.pushes.filter((p) => p.push).map((p) => p.key).join() === "B24|static_fire", "a NEW milestone after the backfill pushes exactly once (B24|static_fire, dry run)");
  done();
})().catch((e) => { console.log("❌ crashed: " + e.stack); process.exit(1); });
