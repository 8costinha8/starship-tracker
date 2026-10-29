/* Offline test of the push ⇄ app invariant (scripts/push-sync.js):
   every push is sent only after the identical item (title, body, source link, time) is in road.json
   where the app shows it, and every attempt is logged to notifications.json.
     node scripts/test-push-sync.js        (PREVIEW_OUT=<dir> also keeps the simulated road.json + log)
   Fake X, fake writer, fake Firebase: nothing is fetched, committed or sent. */
process.env.PUSH_SHADOW = process.env.PUSH_SHADOW || "0"; // live push-shadow.json must not turn this suite into shadow mode

// Legacy send-path checks predate the milestone-only push policy (tested in test-push-policy.js): policy off here.
{ const pp = require("./push-policy.js"); pp.decide = (n) => ({ push: true, reason: "policy off (legacy test)", cls: pp.classify(n) }); pp.orderBatch = (l) => l; }
const fs = require("fs"), os = require("os"), path = require("path");
const road = require("./check-road.js"), ps = require("./push-sync.js"), mission = require("./mission.js");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const NOW = Date.parse("2026-10-22T18:00:00Z"), ago = (h) => new Date(NOW - h * 3600000).toISOString();
const users = [["1", "NASASpaceflight"], ["4", "SpaceX"], ["5", "FAANews"]].map(([id, username]) => ({ id, username, name: username }));
const P = (id, uid, at, text) => ({ id, author_id: uid, created_at: at, text });
const xReply = (posts, newest) => ({ ok: true, status: 200, json: async () => ({ data: posts, meta: { newest_id: newest }, includes: { users, media: [] } }) });

(async () => {
  // 1. sendPush unit checks
  const r0 = { flight: 15, categories: [{ id: "pad", name: "Pad activity", history: [{ id: "x-1", text: "A", push: { title: "T", at: "2026-10-22T10:00:00.000Z" } }] }], mission_updates: {}, feed_items: [] };
  const sent0 = [], rows0 = [];
  const go = (n) => ps.sendPush(n, { road: r0, send: async (m) => sent0.push(m), logRows: rows0, log: () => {} });
  await go({ title: "T", body: "A", at: "2026-10-22T10:00:00.000Z", visible: { where: "road", box: "pad", id: "x-1" } });
  await go({ title: "T", body: "A different text", at: "2026-10-22T10:00:00.000Z", visible: { where: "road", box: "pad", id: "x-1" } });
  await go({ title: "T", body: "A", at: "2026-10-22T10:00:00.000Z" });
  await go({ title: "T", body: "A", at: "2026-10-22T11:00:00.000Z", visible: { where: "road", box: "pad", id: "x-1" } });
  await go({ title: "🚀 Starship", body: "Nowhere", at: "2026-10-22T10:00:00.000Z", visible: { where: "feed", id: "nope" } });
  check(sent0.length === 1 && rows0[0].verdict === "sent", "identical visible entry → sent");
  check(rows0.slice(1).every((r) => /^blocked/.test(r.verdict)), "different body / no visible entry / different time / missing feed item → blocked, not sent");

  // 2. full simulated runs through check-road.js
  const tmp = process.env.PREVIEW_OUT || fs.mkdtempSync(path.join(os.tmpdir(), "ps-"));
  fs.mkdirSync(tmp, { recursive: true });
  const roadPath = path.join(tmp, "road.json"), appJsPath = path.join(tmp, "app.js"), logPath = path.join(tmp, "notifications.json");
  fs.copyFileSync(path.join(__dirname, "fixtures", "road-push-sync.json"), roadPath) /* frozen 22 Oct data: live auto-commits can't change what this test expects */; fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  try { fs.unlinkSync(logPath); } catch {}
  let stored = { seen: [], news: { seen: [], pending: [], sent: [], count: 0, day: "2026-10-22" }, lastRun: ago(0.25) };
  const sent = [], commits = [];
  const deps = { loadState: async () => JSON.parse(JSON.stringify(stored)), saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); }, push: async (n) => { sent.push(n); console.log(`  (fake push) ${n.title} — ${n.body}`); } };
  let xPage = xReply([P("900", "1", ago(3), "hello")], "900");
  const cls = {
    "5001": { kind: "road", stage: "pad", hardware: "Pad 2", text: "Pad 2's chopsticks were lifted for catch tests.", status: "progress" },
    "5002": { kind: "mission-update", topic: "landing", text: "SpaceX plans a tower catch of the ship on Flight 15", attribution: "SpaceX" },
    "5003": { kind: "starship-news", reason: "news" },
    "5004": { kind: "road", stage: "pad", hardware: "Pad 2", text: "Pad 2's chopsticks finished catch tests.", status: "done" },
  };
  const ask = async (prompt) => ({ entries: [...prompt.matchAll(/^(\d+)\. @\S+ \S+ \[[^\]]*\]: .*?#(\d+)/gm)].map((m) => ({ item: +m[1], kind: "skip", stage: null, hardware: null, text: null, reason: "x", ...cls[m[2]] })) });
  const askNews = async (prompt) => [...prompt.matchAll(/^(\d+)\. /gm)].map((m) => ({ item: +m[1], push: true, dup: null, story: "ship-39-stack", headline: "Ship 39 was stacked on Booster 19 at the launch site", reason: "new" }));
  const queued = ps.addFeedItem(JSON.parse(fs.readFileSync(roadPath, "utf8")), { title: "✅ Launch time confirmed", body: "Flight 15: Sat 31 Oct, 00:30 UK time", at: ago(0.1), kind: "flight" });
  const base = { xFirst: true, mode: "dry-run", roadPath, appJsPath, deps, sources: [], commit: (f, m) => commits.push(`${f}: ${m}`), now: () => NOW, next: null, xToken: "fake", notifLogPath: logPath,
    askClaude: async () => { throw new Error("article path must not run"); }, askNews, askDates: async () => [], xFetch: async () => xPage };
  await road.run({ ...base, askXFirst: ask }); // learns since_id
  // the simulated check-flights push: its feed entry is written to road.json first (as check-flights.js does), then handed over
  { const r = JSON.parse(fs.readFileSync(roadPath, "utf8")); ps.addFeedItem(r, { title: queued.title, body: queued.body, at: queued.at, kind: "flight" }); fs.writeFileSync(roadPath, JSON.stringify(r, null, 2) + "\n"); }
  xPage = xReply([P("5001", "1", "2026-10-22T09:12:00.000Z", "Chopsticks lifted on Pad 2 #5001"), P("5002", "4", "2026-10-21T23:05:00.000Z", "Flight 15 ship catch planned #5002"),
    P("5003", "1", "2026-10-22T14:40:00.000Z", "Starship Ship 39 was stacked on Booster 19 at the launch site today #5003")], "5003");
  let res = await road.run({ ...base, askXFirst: ask, pushQueue: [queued] });
  xPage = xReply([P("5004", "5", "2026-10-22T16:20:00.000Z", "Pad 2 chopsticks catch tests complete #5004")], "5004");
  res = await road.run({ ...base, askXFirst: ask, now: () => NOW + 900000 });

  const saved = JSON.parse(fs.readFileSync(roadPath, "utf8")), log = ps.readLog(logPath).pushes;
  const byTitle = (re) => sent.find((n) => re.test(n.title));
  const card = byTitle(/Pad activity · Flight 15|Pad activity: In progress/), mis = byTitle(/^Flight 15 update$/), nws = byTitle(/Starship$/), stat = byTitle(/Pad activity: Complete/), fl = byTitle(/Launch time confirmed/);
  check(sent.length === 5 && card && mis && nws && stat && fl, `5 pushes sent: road card, mission line, news, merge status, flight-checker (${sent.map((n) => n.title).join(" | ")})`);
  for (const n of sent) check(ps.checkVisible(saved, n) === "", `"${n.title}": identical item visible in road.json (${n.visible.where})`);
  const pad = saved.categories.find((c) => c.id === "pad");
  check(stat && stat.body === "Pad activity: Complete (22 Oct)" && pad.history.some((h) => h.kind === "status" && h.text === stat.body && h.at === "2026-10-22T16:20:00.000Z"), `merge-only status: dated line "${stat && stat.body}" in the Pad activity box, push says the same`);
  const ml = (saved.mission_updates["15"] || []).find((u) => u.topic === "landing");
  check(mis && ml && ml.line === mis.body && ml.at === "2026-10-21T23:05:00.000Z" && mis.at === ml.at && mis.url === ml.url, `mission line on the Next flight card = push, post's own time kept (${ml && ml.line})`);
  check(/\(SpaceX, 22 Oct\)\.$/.test(ml.line), "21 Oct 23:05 UTC is 22 Oct 00:05 in UK time → UK day 22 Oct");
  const fi = (saved.feed_items || []).find((f) => nws && f.id === nws.visible.id);
  check(fi && fi.body === nws.body && fi.at === "2026-10-22T14:40:00.000Z" && fi.url === nws.url && nws.link.endsWith(`&item=${fi.id}`), "news: Updates feed item with the push's text, source link, the post's time; push opens that item");
  check(log.length === 5 && log.every((r) => r.verdict === "sent" && r.title && r.body && r.at && "link" in r && "url" in r), `notifications.json: ${log.length} rows with title/body/link/source/time/verdict`);
  const cIdx = commits.findIndex((c) => /^road\.json/.test(c)), lIdx = commits.findIndex((c) => /^notifications\.json/.test(c));
  check(cIdx >= 0 && lIdx > cIdx, "road.json committed before the pushes, push log committed after");
  // a writer that tries to push without the visible copy is stopped
  const rowsX = []; await ps.sendPush({ ...nws, body: nws.body + " (edited)" }, { road: saved, send: async () => { throw new Error("must not send"); }, logRows: rowsX, log: () => {} });
  check(/^blocked/.test(rowsX[0].verdict), "edited text after the save → blocked");
  // app side
  const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
  check(/const ROAD_HIDDEN = \[\];/.test(app), "Launch date box shown on the Road card and feed");
  check(/road\.feed_items/.test(app) && /get\("item"\)/.test(app), "app renders feed_items and ?item= jumps to it");
  check(!/released/i.test(JSON.stringify(saved.feed_items || [])), "no 'released' wording in feed items");
  console.log(`\npreview data: ${tmp}`);
  console.log(fails ? `\n❌ ${fails} check(s) failed` : "\n✅ All checks passed. (Offline — nothing real was fetched, committed or sent.)");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
