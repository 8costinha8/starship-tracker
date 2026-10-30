
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode
// Legacy send-path checks predate the milestone-only push policy (tested in test-push-policy.js): policy off here.
{ const pp = require("./push-policy.js"); pp.decide = (n) => ({ push: true, reason: "policy off (legacy test)", cls: pp.classify(n) }); pp.orderBatch = (l) => l; }
// Offline tests for the X-first Road pipeline (no network, fake X + fake writer + fake Firebase).
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js"), xf = require("./x-first.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const NOW = Date.parse("2026-10-16T18:00:00Z"), ago = (h) => new Date(NOW - h * 3600000).toISOString();
const users = [["1", "LabPadre"], ["2", "RGVaerialphotos"], ["3", "elonmusk"], ["4", "SpaceX"]].map(([id, username]) => ({ id, username, name: username }));
const P = (id, uid, h, text, media) => ({ id, author_id: uid, created_at: ago(h), text, ...(media ? { attachments: { media_keys: [id + "m"] } } : {}), _m: media });
const xReply = (posts, newest) => ({ ok: true, status: 200, json: async () => ({ data: posts.map(({ _m, ...p }) => p), meta: { newest_id: newest },
  includes: { users, media: posts.filter((p) => p._m).map((p) => p._m === "video" ? { media_key: p.id + "m", type: "video", preview_image_url: `https://pbs.twimg.com/${p.id}-poster.jpg`, variants: [{ content_type: "video/mp4", bit_rate: 1, url: `https://video.twimg.com/${p.id}.mp4` }] } : { media_key: p.id + "m", type: "photo", url: `https://pbs.twimg.com/${p.id}.jpg` }) } }) });
(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xf-"));
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js");
  fs.copyFileSync(path.join(ROOT, "road.json"), roadPath); fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  { // this scenario is "S43 with no cryo done yet": drop the real Flight 16 audit cards (Road page only) from the fixture copy
    const rj = JSON.parse(fs.readFileSync(roadPath, "utf8")); for (const c of rj.categories) c.history = (c.history || []).filter((h) => !(h.audit && h.flight === 16)); fs.writeFileSync(roadPath, JSON.stringify(rj, null, 2) + "\n"); }
  const before = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  const oldCards = before.categories.flatMap((c) => (c.history || []).filter((h) => h.kind !== "check").map((h) => `${c.id}|${h.date}|${h.text}`));
  const mediaBefore = fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8");
  let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-16" }, lastRun: ago(0.25) };
  const sent = [], commits = [], urls = [], asks = [];
  const deps = { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => sent.push(n) };
  const article = { name: "NSF (article)", fetch: async () => [{ key: "rss:nsf-1", title: "Ship 42 rolls to Massey's for cryo", text: "Ship 42 rolled to Massey's for cryo testing.", url: "https://www.nasaspaceflight.com/x", publishedAt: ago(2), src: "NSF", source: "NASASpaceflight", tier: "trusted" }] };
  let xPage = xReply([P("900", "1", 3, "hello")], "900");
  const base = { xFirst: true, mode: "dry-run", roadPath, appJsPath, deps, sources: [article], commit: (f, m) => commits.push(m), now: () => NOW, next: null, xToken: "fake",
    askClaude: async () => { throw new Error("article path must not run"); }, askNews: async () => [], askDates: async () => [],
    xFetch: async (u) => { urls.push(new URL(u)); return xPage; } };
  // Massey's posts use Ship 43 (cryo not yet done in live road.json): Ship 42 finished cryo, so its Massey's trips now file under Static fires (test-massey.js).
  const cls = { "1001": { kind: "road", stage: "cryo", hardware: "S43", text: "Ship 43 rolled to Massey's for cryo testing." },
    "1002": { kind: "road", stage: "cryo", hardware: "Ship 43", text: "Ship 43 is on the cryo stand." },
    "1003": { kind: "skip", reason: "meme" }, "1004": { kind: "news", reason: "programme news" },
    "1005": { kind: "road", stage: "static", hardware: "B70", text: "Booster 22 rolled to the static fire site." },
    "1006": { kind: "road", stage: "pad", hardware: "Pad 2", text: "Pad 2's chopsticks were tested." } };
  const ask = async (prompt, o) => { asks.push(prompt); return { entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\d+)/gm)].map((m) => ({ item: +m[1], kind: "skip", stage: null, hardware: null, text: null, reason: "x", ...cls[m[2]] })) }; };

  // run 1: first run only learns since_id
  let res = await road.run({ ...base, askXFirst: ask });
  const q = urls[0];
  check(xf.XF_ACCOUNTS.every((a) => q.searchParams.get("query").includes(`from:${a}`)) && /-is:retweet -is:reply/.test(q.searchParams.get("query")) && /search\/recent/.test(q.pathname), "one X search over the 11 trusted accounts, no reposts or replies");
  check(!q.searchParams.get("since_id") && res.changes.length === 0 && stored.xFirst.sinceId === "900" && asks.length === 0, "first run: remembers the newest id, makes no cards, no writer call");
  check(!JSON.stringify(JSON.parse(fs.readFileSync(roadPath, "utf8"))).includes("nasaspaceflight.com/x"), "articles never create Road cards");

  // run 2: new posts
  urls.length = 0; sent.length = 0;
  xPage = xReply([P("1001", "1", 30, "S43 rolling to Massey's #1001", "photo"), P("1002", "2", 5, "Ship 43 on the cryo stand #1002", "video"), P("1003", "1", 4, "lol meme #1003", "photo"),
    P("1004", "4", 3, "Starship programme update #1004"), P("1005", "1", 2, "B70 rolling to Massey's #1005", "video"), P("1006", "2", 1, "Pad 2 chopsticks test #1006", "photo"),
    P("1007", "3", 1, "Tesla Q3 numbers #1007", "photo")], "1007");
  res = await road.run({ ...base, askXFirst: ask });
  const r = JSON.parse(fs.readFileSync(roadPath, "utf8")), B = (id) => r.categories.find((c) => c.id === id);
  check(urls.length === 1 && urls[0].searchParams.get("since_id") === "900", "next run reads only posts since the last id (one X call)");
  check(asks.length === 1 && !/#1007/.test(asks[0]) && /#1003/.test(asks[0]), "ONE batched writer call; Elon's non-Starship post never sent");
  check(/memes, opinions, jokes, renders/.test(asks[0]) && /"cryo"/.test(asks[0]) && /"faa"/.test(asks[0]), "prompt: road (with a stage) / news / skip, memes/opinions/renders skipped");
  const cryo = B("cryo").history[0];
  check(cryo.id === "x-1001" && cryo.x_first && cryo.stage === "cryo" && cryo.x_text === "Ship 43 rolled to Massey's for cryo testing." && cryo.src === "@LabPadre" && cryo.url === "https://x.com/RGVaerialphotos/status/1002", "road post → card on top of its stage box (writer text, @author, link)");
  check(cryo.x_posts.join() === "1001,1002" && cryo.media_override.type === "video" && cryo.media_override.image === "https://pbs.twimg.com/1002-poster.jpg" && cryo.media_override.author === "RGVaerialphotos", "S43 (no cryo done yet) posts within 48h merge into one card; video beats photo (preview image)");
  check(B("static").history[0].media_override.image === "https://pbs.twimg.com/1005-poster.jpg" && B("pad").history[0].media_override.image === "https://pbs.twimg.com/1006.jpg", "video card uses its preview image, photo card its photo");
  check(!/(status\/|x[-:])100[34]\b/.test(JSON.stringify(r)), "skip and news posts make no card");
  check(res.xFirst.news.length === 1 && res.xFirst.news[0].key === "x:1004", "news posts go to the news pushes");
  check(sent.length === 3 && sent.every((n) => /\?feed=1&entry=x-\d+$/.test(n.link) && n.image) && sent.map((n) => n.link.split("entry=")[1]).sort().join() === "x-1001,x-1005,x-1006", "one push per NEW card (merge doesn't push), deep link ?feed=1&entry=<id>, picture");
  const now = r.categories.flatMap((c) => (c.history || []).filter((h) => h.kind !== "check").map((h) => `${c.id}|${h.date}|${h.text}`));
  check(oldCards.every((k) => now.includes(k)) && fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8") === mediaBefore, "the 14 existing cards and road-media.json stay as they are");
  check(urls.every((u) => /search\/recent/.test(u.pathname)), "no picture search / judge calls");

  // run 3: same posts again → dedup, nothing new; cap
  sent.length = 0; asks.length = 0;
  res = await road.run({ ...base, askXFirst: ask });
  check(sent.length === 0 && asks.length === 0, "already-seen posts: no writer call, no push");
  const many = Array.from({ length: 8 }, (_, i) => P(String(2000 + i), "1", 1, `B${30 + i} news #${2000 + i}`, "photo"));
  for (const p of many) cls[p.id] = { kind: "road", stage: "pad", hardware: `B${30 + many.indexOf(p)}`, text: `Booster ${30 + many.indexOf(p)} moved.` };
  xPage = xReply(many, "2007");
  res = await road.run({ ...base, askXFirst: ask });
  check(sent.length === 5 && stored.xFirst.seen.filter((x) => x >= "2000").length === 5, "existing cap: 5 cards/pushes per run, the rest wait (not marked seen)");
  sent.length = 0; xPage = xReply([], "2007");
  res = await road.run({ ...base, askXFirst: ask });
  check(sent.length === 3 && stored.xFirst.pending.length === 0, "the 3 waiting posts become cards on the next run");
  // writer failure → retried
  const t0 = stored.xFirst.sinceId; xPage = xReply([P("3001", "1", 1, "S50 #3001", "photo")], "3001");
  res = await road.run({ ...base, askXFirst: async () => { throw new Error("down"); } });
  check(stored.xFirst.sinceId === t0, "writer down: since_id not advanced, posts retried next run");
  // status updates (same rules as the article path)
  const st = (id) => JSON.parse(fs.readFileSync(roadPath, "utf8")).categories.find((c) => c.id === id);
  { const r0 = JSON.parse(fs.readFileSync(roadPath, "utf8")); r0.categories.find((c) => c.id === "static").status = "pending"; r0.categories.find((c) => c.id === "cryo").status = "complete"; r0.categories.find((c) => c.id === "date").status = "pending"; fs.writeFileSync(roadPath, JSON.stringify(r0, null, 2)); }
  Object.assign(cls, { "4001": { kind: "road", stage: "static", hardware: "B60", text: "Booster 60 began its static fire campaign.", status: "progress" },
    "4002": { kind: "road", stage: "cryo", hardware: "S61", text: "Ship 61 is back at Massey's for more cryo testing.", status: "progress" },
    "4003": { kind: "road", stage: "date", hardware: null, text: "Flight 15 is set for 30 Oct.", status: "confirmed" },
    "4004": { kind: "road", stage: "faa", hardware: "FAA", text: "The FAA issued the Flight 15 licence.", status: "done" } });
  sent.length = 0; xPage = xReply([P("4001", "4", 1, "B60 #4001", "photo"), P("4002", "4", 1, "S61 #4002", "photo"), P("4003", "1", 1, "NET 30 Oct #4003", "photo"), P("4004", "4", 1, "licence #4004", "photo")], "4004");
  res = await road.run({ ...base, askXFirst: ask });
  check(st("static").status === "progress" && sent.some((n) => /Static fires: In progress/.test(n.title) && /entry=x-4001$/.test(n.link)), "status: in progress applies, push names the box and new status (existing push)");
  check(st("cryo").status === "progress", "a finished stage can be re-opened by a trusted account (both directions)");
  check(st("date").status === "pending" && !/Launch date: Confirmed/.test(sent.map((n) => n.title).join()), "Launch date: only SpaceX/FAA can confirm (LabPadre blocked)");
  check(st("faa").status === "complete" && st("faa").history[0].complete === true && st("faa").latest === "Confirmed", "done → stage complete (Done, green entry)");
  Object.assign(cls, { "4005": { kind: "road", stage: "date", hardware: null, text: "SpaceX set Flight 15 for 30 Oct.", status: "confirmed" }, "4006": { kind: "road", stage: "static", hardware: "B60", text: "Booster 60 finished its static fire.", status: "done" } });
  sent.length = 0; xPage = xReply([P("4005", "4", 1, "Flight 15 NET 30 Oct #4005", "photo"), P("4006", "4", 0.5, "B60 static fire done #4006", "video")], "4006");
  res = await road.run({ ...base, askXFirst: ask });
  check(st("date").status === "done" && sent.some((n) => /Launch date: Confirmed/.test(n.title)), "SpaceX post confirms the Launch date");
  // one vehicle finishing is not the whole stage: the section only rolls up to Done when every Flight 15 vehicle completed (test-logtext.js)
  check(st("static").status === "progress" && st("static").history.filter((h) => h.hardware === "B60").length === 1 && !sent.some((n) => /Static fires: (Done|Complete)/.test(n.title)), "merged post finishing ONE vehicle's stage keeps the section In progress (no Done push)");
  check(road.xStatus({ id: "date" }, "done") === null && road.xStatus({ id: "pad" }, "confirmed") === null, "done is not used on the Launch date; confirmed only there");
  // source tiers: a Tier 2 tracker can't move a status; rumour wording is Tier 3
  { const r0 = JSON.parse(fs.readFileSync(roadPath, "utf8")); r0.categories.find((c) => c.id === "pad").status = "pending"; fs.writeFileSync(roadPath, JSON.stringify(r0, null, 2)); }
  Object.assign(cls, { "4101": { kind: "road", stage: "pad", hardware: "Pad 2", text: "Pad 2 work is done.", status: "done" } });
  sent.length = 0; xPage = xReply([P("4101", "1", 0.4, "Pad 2 done #4101", "photo")], "4101");
  res = await road.run({ ...base, askXFirst: ask });
  check(st("pad").status === "complete" && st("pad").history.some((h) => (h.x_posts || []).includes("4101")) && sent.some((n) => /Pad activity: Complete/.test(n.title)), "Tier 2 (LabPadre) can now move a status (Pad activity: Done), labelled Reported");
  { const tiers = require("./source-tiers.js"); const au = (u) => ({ author: { username: u } });
    check(tiers.tierOf(au("NASASpaceflight"), { text: "Booster 22 finished its static fire." }) === 1 && tiers.tierOf(au("LabPadre"), { text: "Ship 42 rolled out." }) === 2 && tiers.tierOf(au("SpaceX"), { text: "Booster 22 could roll out next week." }) === 1 && tiers.tierOf(au("TrackingTheSB"), { text: "Booster 22 could roll out next week." }) === 3 && tiers.tierOf(au("LabPadre"), { speculative: true, text: "x" }) === 3, "tierOf: Tier 1 accounts, Tier 2 trackers, rumour wording from any account is Tier 3");
    const before = tiers.tierOf(au("SpaceflightNow"), { text: "x" }); process.env.SOURCE_TIERS_PROPOSED = "1"; const after = tiers.tierOf(au("SpaceflightNow"), { text: "x" }); const q = road.xfQuery ? null : null; delete process.env.SOURCE_TIERS_PROPOSED;
    check(before === 1 && after === 1 && tiers.TIER2.length === 14, "Spaceflight Now is live Tier 1 (sources.js), with or without SOURCE_TIERS_PROPOSED"); }
  // app
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  check(!/<Tags h=|Build-up \(|Earlier photo/.test(app) && /mini-src">\{srcOf\(h\)\}/.test(app) && /<summary>Earlier updates<\/summary>/.test(app) && !/Earlier updates \(\$\{/.test(app) && /function tierOf/.test(fs.readFileSync(path.join(__dirname, "source-tiers.js"), "utf8")), "app: no status/tier/Unconfirmed/Earlier photo labels on cards (tier data kept in the backend); quiet 'Earlier updates (N)' toggle");
  check(/const PLAY_ICON = null/.test(app) && /get\("entry"\)/.test(app) && /data-entry=\{h\.id/.test(app), "app: no play badge; ?entry= scrolls to and highlights the card");
  check(/Number\.isInteger\(h\.flight\)\) return h\.flight/.test(app) && /rank\(a\.flight\) - rank\(b\.flight\) \|\| b\.when - a\.when/.test(app) && /!\(h\.flight > road\.flight\)/.test(app), "flight sections are data-driven (entry flight tag), next flight on top, later flights below, newest first by post date; later flights stay off the Starship card");
  { const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")); const b23 = live.categories.find((c) => c.id === "cryo").history.find((h) => h.id === "x-2110889490336350574");
    check(b23 && b23.flight === 16 && b23.manual && b23.media_override.author === "StarshipGazer", "manual Flight 16 card (B23 cryo, @StarshipGazer)");
    const bad = JSON.parse(JSON.stringify(live)); bad.categories[0].history[0].flight = "16"; let threw = false; try { road.validateRoad(bad); } catch { threw = true; } check(threw, "a malformed flight tag is rejected"); }
  check(xf.hwKey("Ship 42") === xf.hwKey("S42") && xf.hwKey("Booster 22") === "B22", "hardware ids normalise (Ship 42 = S42)");
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All X-first checks passed."); process.exit(fails ? 1 : 0);
})();
