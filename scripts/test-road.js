/* ─────────────────────────────────────────────────────────────
   Full dry run of check-road.js with NO real network:
   every source, Claude and Firebase are faked, road.json and app.js are
   temporary copies, nothing is committed or sent.
     node scripts/test-road.js
   It runs the real parsers, filters, trust rules, cap and rollover, and
   prints ✅ / ❌ for each check. Exit code 1 if any check fails.
   ───────────────────────────────────────────────────────────── */

const fs = require("fs");
const os = require("os");
const path = require("path");
const road = require("./check-road.js");

const ROOT = path.join(__dirname, "..");
const H = 3600000;
const ago = (h) => new Date(Date.now() - h * H).toISOString();
const rfc = (h) => new Date(Date.now() - h * H).toUTCString();

/* ───── fake sources (shaped like the real feeds) ───── */
const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title><![CDATA[${i.title}]]></title><link>${i.url}</link><guid>${i.url}</guid><pubDate>${rfc(i.h)}</pubDate><description><![CDATA[<p>${i.desc}</p>]]></description></item>`).join("")}</channel></rss>`;
const atom = (items) => `<?xml version="1.0"?><feed xmlns:media="http://search.yahoo.com/mrss/">${items.map((i) => `<entry><id>yt:video:${i.id}</id><title>${i.title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${i.id}"/><published>${ago(i.h)}</published><media:group><media:description>${i.desc}</media:description></media:group></entry>`).join("")}</feed>`;

const FIX = {
  "nasaspaceflight.com/feed": rss([
    { title: "Booster 22 completes static fire at Massey's", url: "https://www.nasaspaceflight.com/2026/10/b22-static-fire/", h: 3, desc: "Booster 22 lit its Raptor engines for a static fire at Massey's on Wednesday. Ship 42 is still in Mega Bay 2." },
    { title: "Starship Flight 14 recap", url: "https://www.nasaspaceflight.com/2026/09/f14-recap/", h: 200, desc: "A look back at Flight 14." },
    { title: "Falcon 9 launches Starlink Group 12-4", url: "https://www.nasaspaceflight.com/2026/10/sl-12-4/", h: 1, desc: "Falcon 9 deployed 28 Starlink satellites." },
  ]),
  "spacenews.com/feed": rss([
    { title: "FAA approves Starship Flight 15 licence modification", url: "https://spacenews.com/faa-approves-starship-flight-15/", h: 5, desc: "The FAA modified SpaceX's Starship licence to cover Flight 15." },
  ]),
  "spaceflightnow.com/feed": rss([
    { title: "SpaceX rolls Ship 42 to Pad 2", url: "https://spaceflightnow.com/2026/10/s42-pad-2/", h: 2, desc: "Already handled in an earlier run." },
  ]),
  "spaceflightnewsapi.net": JSON.stringify({ results: [
    { title: "Booster 22 completes static fire at Massey's", url: "https://www.nasaspaceflight.com/2026/10/b22-static-fire/", news_site: "NASASpaceflight", summary: "Same article via the aggregator.", published_at: ago(3) },
    { title: "Ship 42 could roll to Pad 2 this weekend, sources say", url: "https://www.teslarati.com/ship-42-pad-2-weekend/", news_site: "Teslarati", summary: "Ship 42 may move to Pad 2 this weekend, according to people familiar with the plan.", published_at: ago(4) },
  ] }),
  "channel_id=UCSUu1lih2RifWkKtDOJdsBA": atom([{ id: "nsf1", title: "Booster 22 returns to Massey's for more cryo testing", h: 6, desc: "B22 rolled back to Massey's for another cryo test." }]),
  "channel_id=UCFwMITSkc1Fms6PoJoh1OUQ": atom([{ id: "lp1", title: "Starbase Live: 24/7 Starship & Super Heavy Development", h: 1, desc: "Live views of Starbase." }]),
  "channel_id=UCtI0Hodo5o5dUb67FeUjDeA": atom([]),
  "spacex-website/updates": JSON.stringify([{ updateId: "orbital-starship", date: "2026-09-15", title: "Starship to Orbit", contentBlocks: [{ paragraph: "Starting with Flight 14, Starship will begin flying orbital missions." }] }]),
  "launches-page-tiles/upcoming": JSON.stringify([{ id: 1, title: "Starlink Mission", vehicle: "Falcon 9", link: "sl-15-25", launchDate: "2026-10-10", launchTime: "11:00:00", launchSite: "SLC-4E" }]),
  "faa.gov/newsroom": `<h2>Recent Statements</h2><h3>Sept. 7, 2026</h3><p><strong>FAA statement on Starship Flight 14</strong></p><p>The FAA issued a licence for Starship Flight 14.</p><h3>Sept. 18, 2026</h3><p><strong>FAA Statement on Washington D.C. Arch</strong></p><p>Not a hazard.</p>`,
  "ll.thespacedevs.com": JSON.stringify({ results: [{ name: "Starship | Flight 15", updates: [
    { id: 9001, comment: "S42 cryo test may have failed?", info_url: "https://x.com/someStarbaseFan/status/111", created_on: ago(2) },
  ] }] }),
};
const X_POSTS = [
  { id: "500", author_id: "1", text: "Starship Flight 15 is targeting 21 October. A 2-hour launch window opens at 23:00 UTC", created_at: ago(0.5) },
  { id: "400", author_id: "2", text: "Ship 42 static fire at Massey's this evening, all six engines lit", created_at: ago(1) },
];

let calls = { claude: 0, x: 0 };
let claudeDown = false;
let claudeScript = []; // canned replies used first (RUN 6)

// Fake Claude: reads the numbered items in the real prompt and answers like Claude would.
const CANNED = [
  [/Booster 22 completes static fire/, { box: "static", line: "Booster 22 completed a static fire at Massey's.", short: "B22 static fire done, S42 still to go", status: "progress" }],
  [/FAA approves/, { box: "faa", line: "FAA has modified the licence to cover Flight 15.", short: "Licence now covers Flight 15", status: "complete" }],
  [/could roll to Pad 2/, { box: "pad", line: "Ship 42 may roll to Pad 2 this weekend, per unnamed sources.", short: "S42 may roll to Pad 2", status: "progress" }],
  [/returns to Massey's for more cryo/, { box: "cryo", line: "Booster 22 back at Massey's for more cryo testing.", short: "B22 back at Massey's for more cryo", status: "progress" }],
  [/cryo test may have failed/, { box: "cryo", line: "A post asks if S42's cryo test failed. Not confirmed.", short: "x", status: "pending" }],
  [/targeting 21 October/, { box: "date", line: "SpaceX is targeting 21 Oct, window opens 23:00 UTC.", short: "SpaceX targeting 21 Oct", status: "done" }],
  [/Ship 42 static fire at Massey's/, { box: "static", line: "Ship 42 completed a static fire at Massey's.", short: "S42 static fire done", status: "complete" }],
];
function fakeClaude(prompt) {
  calls.claude++;
  if (claudeScript.length) return claudeScript.shift();
  if (claudeDown) return { error: { type: "overloaded_error", message: "fake outage" } };
  const lines = prompt.split("Items:\n")[1].split("\n");
  const out = [];
  lines.forEach((l) => {
    const m = l.match(/^(\d+)\. /);
    if (!m) return;
    const hit = CANNED.find(([re]) => re.test(l));
    if (hit) out.push({ item: Number(m[1]), ...hit[1] });
  });
  return { content: [{ type: "text", text: "```json\n" + JSON.stringify(out) + "\n```" }] };
}

global.fetch = async (url, opts = {}) => {
  url = String(url);
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => body, json: async () => JSON.parse(body) });
  if (url.startsWith("https://api.anthropic.com/")) return reply(JSON.stringify(fakeClaude(JSON.parse(opts.body).messages[0].content)));
  if (url.startsWith("https://api.x.com/2/users/by")) return reply(JSON.stringify({ data: [{ id: "1", username: "SpaceX" }, { id: "2", username: "NASASpaceflight" }] }));
  if (url.startsWith("https://api.x.com/2/tweets/search/recent")) {
    calls.x++;
    const since = new URL(url).searchParams.get("since_id");
    const data = X_POSTS.filter((p) => !since || Number(p.id) > Number(since));
    return reply(JSON.stringify(data.length ? { data, meta: { newest_id: data[0].id } } : { meta: { result_count: 0 } }));
  }
  const key = Object.keys(FIX).find((k) => url.includes(k));
  if (!key) return reply("not found", 404);
  return reply(FIX[key]);
};
process.env.X_BEARER_TOKEN = "fake-token";
process.env.ANTHROPIC_API_KEY = "fake-key";

/* ───── fake Firebase + git ───── */
let stored = { seen: ["rss:https://spaceflightnow.com/2026/10/s42-pad-2/"], lastRun: ago(0.25) }; // as if earlier runs happened
const sent = [];
const commits = [];
const deps = {
  loadState: async () => (stored ? JSON.parse(JSON.stringify(stored)) : null),
  saveState: async (s) => { stored = JSON.parse(JSON.stringify(s)); },
  push: async (n) => { sent.push(n); console.log(`(fake push) ${n.title} — ${n.body}`); },
};

/* ───── checks ───── */
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };
const box = (r, id) => r.categories.find((c) => c.id === id);

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "road-test-"));
  const roadPath = path.join(tmp, "road.json");
  const appJsPath = path.join(tmp, "app.js");
  fs.copyFileSync(path.join(ROOT, "road.json"), roadPath);
  fs.copyFileSync(path.join(ROOT, "app.js"), appJsPath);
  { // start with Cryo finished, so RUN 1 can show a trusted source re-opening it
    const start = JSON.parse(fs.readFileSync(roadPath, "utf8"));
    start.categories.find((c) => c.id === "cryo").status = "done";
    fs.writeFileSync(roadPath, JSON.stringify(start, null, 2) + "\n");
  }
  const opts = { mode: "dry-run", roadPath, appJsPath, deps, commit: (f, m) => { commits.push(m); console.log(`(fake commit) ${m}`); } };

  console.log("\n────────── RUN 1: normal run with a mix of posts ──────────");
  let res = await road.run(opts);
  let r = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(res.changes.length === 5, `capped at 5 changes this run (got ${res.changes.length})`);
  check(sent.length === 5 && commits.length === 1, `one push per change (${sent.length}) and one commit (${commits.length})`);
  check(box(r, "date").status === "done" && box(r, "date").history[0].src === "SpaceX", "SpaceX post on X → Launch date Confirmed (official source)");
  check(box(r, "faa").status === "complete" && box(r, "faa").latest === "Done" && box(r, "faa").history[0].src === "SpaceNews" && box(r, "faa").history[0].complete === true && box(r, "faa").history.slice(1).every((h) => !h.complete), "SpaceNews (trusted) says licence modified → FAA licence complete, headline \"Done\", only that entry flagged complete");
  check(r.categories.every((c) => c.history.filter((h) => h.kind === "check").length === 0 || !c.history.some((h) => h.key)), "every box that got real news lost its \"no news yet\" line");
  const st = box(r, "static");
  check(st.status === "complete" && st.history[0].text.startsWith("Ship 42") && st.history[1].text.startsWith("Booster 22") && st.latest === "Done" && st.history[0].complete === true && !st.history[1].complete, "B22 then S42 static fires → Static fires complete, newest first, headline \"Done\", S42 entry flagged");
  const cryo = box(r, "cryo");
  check(cryo.status === "progress" && cryo.history[0].src === "NSF" && cryo.latest === "B22 back at Massey's for more cryo" && cryo.history.length === JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")).categories.find((c) => c.id === "cryo").history.length + 1, "NSF says B22 back for cryo → finished stage re-opened (In progress), new entry on top, older kept");
  check(!r.categories.some((c) => c.history.some((h) => /Flight 14 recap|Falcon 9|Starbase Live|Ship 42 to Pad 2/i.test(h.text))), "stale, off-topic, irrelevant and already-seen posts ignored");
  check(r.categories.every((c) => c.history.filter((h) => /b22-static-fire/.test(h.url || "")).length <= 1), "same NSF article from two sources added once");
  check(stored.pending.length === 2 && stored.pending.every((p) => p.tier === "unconfirmed"), `cap keeps official/trusted first; ${stored.pending.length} unconfirmed post(s) wait for the next run`);
  check(r.updated === new Date().toLocaleString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }), `"Updated" date set to today (${r.updated})`);
  check(sent.some((n) => n.title === "🗓️ Launch date: Confirmed") && sent.some((n) => n.title === "💥 Static fires: In progress"), "notification titles name the box and its new status");

  console.log("\n────────── RUN 2: Claude is down ──────────");
  claudeDown = true;
  sent.length = 0;
  res = await road.run(opts);
  check(res.changes.length === 0 && sent.length === 0, "no change and no push when Claude fails");
  check(stored.pending.length === 2, "the waiting posts are still kept for later");

  console.log("\n────────── RUN 3: Claude back — the waiting posts go in ──────────");
  claudeDown = false;
  res = await road.run(opts);
  r = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  const pad = box(r, "pad");
  check(pad.history[0].trust === "unconfirmed" && pad.history[0].src === "Teslarati" && pad.latest.startsWith("Pad 2 being serviced"), "Teslarati rumour → added with Unconfirmed tag, headline untouched");
  check(box(r, "cryo").status === "progress" && box(r, "cryo").history[0].trust === "unconfirmed", "unconfirmed X post suggesting a cryo failure → tagged, status unchanged");
  check(sent.length === 2 && sent.every((n) => /\(unconfirmed\)$/.test(n.title)), `pushes say (unconfirmed): ${sent.map((n) => n.title).join(" | ")}`);

  fs.copyFileSync(roadPath, path.join(os.tmpdir(), "road-dryrun-run3.json")); // for a screenshot of the tags

  console.log("\n────────── RUN 4: same feeds again ──────────");
  sent.length = 0;
  const before = fs.readFileSync(roadPath, "utf8");
  const claudeBefore = calls.claude;
  res = await road.run(opts);
  check(fs.readFileSync(roadPath, "utf8") === before && sent.length === 0, "nothing new → road.json untouched, no push");
  check(calls.claude === claudeBefore, "nothing new → Claude not called (no cost)");

  console.log("\n────────── RUN 5: Flight 15 flies and gets logged in app.js ──────────");
  const app = fs.readFileSync(appJsPath, "utf8");
  const end = app.indexOf("\n];", app.indexOf("const FLIGHTS = ["));
  fs.writeFileSync(appJsPath, app.slice(0, end) + `\n  { n: 15, date: "2026-10-21T23:00:00Z", pad: "Pad 2", block: "V3", booster: "B22", ship: "S42", outcome: "success",\n    headline: "x", highlights: "",\n    story: "x" },` + app.slice(end));
  res = await road.run(opts);
  r = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(r.flight === 16 && r.categories.every((c) => c.status === "none" && c.history.length === 0), "rolled over to Road to Flight 16 with empty boxes");
  check(sent.length === 1 && sent[0].title === "🚀 Road to Flight 16", `rollover push sent (${sent[0] && sent[0].title})`);

  console.log("\n────────── unit checks ──────────");
  check(road.trustForUrl("https://x.com/NASASpaceflight/status/1").tier === "trusted" && road.trustForUrl("https://x.com/rando/status/1").tier === "unconfirmed" && road.trustForUrl("https://www.spacex.com/launches/x").tier === "official", "trust lookup by link");
  check(road.cleanLine("Starship released 10 Starlink satellites", { fullStop: true }) === "Starship deployed 10 Starlink satellites.", "\"released\" → \"deployed\"");
  check(road.lastLoggedFlight(fs.readFileSync(path.join(ROOT, "app.js"), "utf8")) === 14, "reads last logged flight (14) from the real app.js");
  let threw = false; try { road.validateRoad({ flight: 15, categories: [] }); } catch { threw = true; }
  check(threw, "a broken road.json is refused before saving");

  // video chapters: timestamps dropped, chapter titles kept, boilerplate still cut
  const desc = "Ship 43 continues preparations. ⚡ Become a member of NSF's channel. Timestamps: 0:00 Starbase Summary 0:37 Pad 2 Dancefloor Installed 1:28 Pad 2 Chopstick Actuator Removed 6:22 Ship 43 in Mega Bay 2 LDAPAABJRG2UMCU3";
  const strip = road.stripBoilerplate(desc);
  check(/Chapter: Pad 2 Dancefloor Installed\./.test(strip) && /Chapter: Starbase Summary\./.test(strip) && /Chapter: Ship 43 in Mega Bay 2\./.test(strip) && !/\d:\d\d|Become a member|LDAPA/.test(strip), "video chapters kept without timestamps, boilerplate cut");
  check(road.stripBoilerplate("Booster 22 rolled out at 10:30 today.") === "Booster 22 rolled out at 10:30 today.", "a lone time in normal text is left alone");

  // history: newest first by date (incl. "9–10 Sep" ranges), stable on ties
  const now = new Date("2026-10-07T18:00:00Z");
  const hist = road.sortHistory([
    { date: "5 Oct", text: "a", at: "2026-10-05T00:32:46Z" }, { date: "7 Oct", text: "b" }, { date: "9–10 Sep", text: "c" },
    { date: "30 Sep", text: "d" }, { date: "7 Oct", text: "e", at: "2026-10-07T09:00:00Z" }, { date: "28 Dec", text: "f" }, { date: "??", text: "g" },
  ], now).map((h) => h.text).join("");
  check(hist === "beadcfg", `history sorted newest first, ties keep order, "28 Dec" = last year, undated last (got ${hist})`);

  // headline: kept unless Claude says it supersedes, or the status moves
  const hr = road.freshRoad(15);
  const hpad = hr.categories.find((c) => c.id === "pad");
  hpad.status = "progress"; hpad.latest = "Pad 2 being serviced";
  const items = [1, 2, 3, 4].map((n) => ({ key: `k${n}`, title: `t${n}`, src: "NSF", source: "nsf", tier: "trusted", publishedAt: ago(n) }));
  road.applyUpdates(hr, items, [{ item: 1, box: "pad", line: "Flight 15 will launch from Starbase.", short: "Flight 15 from Starbase", status: null, supersedes: false }], () => {}, 5);
  check(hpad.latest === "Pad 2 being serviced", "new fact without supersedes → headline kept");
  road.applyUpdates(hr, items, [{ item: 2, box: "pad", line: "Pad 2 servicing finished.", short: "Pad 2 servicing finished", status: null, supersedes: true }], () => {}, 5);
  check(hpad.latest === "Pad 2 servicing finished", "supersedes: true → headline replaced");
  road.applyUpdates(hr, items, [{ item: 3, box: "pad", line: "Ship 42 rolled to Pad 2.", short: "S42 at Pad 2", status: "progress" }], () => {}, 5);
  check(hpad.latest === "Pad 2 servicing finished" && hpad.status === "progress", "same status → headline kept");
  hpad.status = "pending";
  road.applyUpdates(hr, items, [{ item: 4, box: "pad", line: "Ship 42 rolled to Pad 2 again.", short: "S42 at Pad 2", status: "progress" }], () => {}, 5);
  check(hpad.latest === "S42 at Pad 2" && hpad.status === "progress", "status change → headline replaced");

  console.log("\n────────── RUN 6: several facts from one item, empty Claude replies ──────────");
  road.LIMITS.claudeRetryMs = 0;
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "road-test6-"));
  fs.copyFileSync(path.join(ROOT, "road.json"), path.join(tmp2, "road.json"));
  fs.copyFileSync(path.join(ROOT, "app.js"), path.join(tmp2, "app.js"));
  let state6 = { seen: [] };
  let feed6 = [];
  const opts6 = {
    mode: "dry-run", roadPath: path.join(tmp2, "road.json"), appJsPath: path.join(tmp2, "app.js"), commit: () => {},
    sources: [{ name: "fake", fetch: async () => feed6 }],
    deps: { loadState: async () => JSON.parse(JSON.stringify(state6)), saveState: async (st) => { state6 = JSON.parse(JSON.stringify(st)); }, push: async () => {} },
  };
  const textReply = (arr) => ({ content: [{ type: "text", text: JSON.stringify(arr) }], stop_reason: "end_turn", usage: { output_tokens: 300 } });
  const thinkingOnly = { content: [{ type: "thinking", thinking: "", signature: "x".repeat(900) }], stop_reason: "max_tokens", usage: { output_tokens: 16000 } };
  const item6 = (key, title) => ({ key: `rss:${key}`, title, text: title, url: `https://www.nasaspaceflight.com/2026/10/${key}/`, publishedAt: ago(1), src: "NSF", source: "nsf", tier: "trusted" });
  const r6 = () => JSON.parse(fs.readFileSync(opts6.roadPath, "utf8"));

  // a) one item, several facts: 3 kept, a duplicate and a 4th fact dropped
  feed6 = [item6("multi", "Ship 42 rolls to Pad 2 as Booster 22 static fire nears")];
  claudeScript = [textReply([
    { item: 1, box: "pad", line: "Ship 42 rolled to Pad 2.", short: "S42 at Pad 2", status: null, reason: "vehicle move" },
    { item: 1, box: "static", line: "Booster 22 may static fire next week.", short: "B22 static fire may come next week", status: null, reason: "hedged plan" },
    { item: 1, box: "pad", line: "Ship 42 rolled to Pad 2.", short: "dup", status: null, reason: "same fact again" },
    { item: 1, box: "faa", line: "The FAA could reportedly modify the licence soon.", short: "FAA change reportedly soon", status: null, reason: "hedged" },
    { item: 1, box: "date", line: "A fourth fact that must be dropped.", short: "fourth", status: null, reason: "over the limit" },
  ])];
  res = await road.run(opts6);
  r = r6();
  const fromMulti = r.categories.flatMap((c) => c.history.filter((h) => h.key === "rss:multi").map((h) => ({ box: c.id, ...h })));
  check(res.changes.length === 3 && fromMulti.length === 3 && fromMulti.map((h) => h.box).sort().join() === "faa,pad,static", `one item → 3 facts in 3 boxes (${fromMulti.map((h) => h.box).join(", ")}), duplicate and 4th fact dropped`);
  check(fromMulti.every((h) => h.src === "NSF" && h.trust === "trusted" && h.source === "nsf" && /multi/.test(h.url)), "each fact keeps the item's source, trust and link");
  check(state6.seen.includes("rss:multi"), "the multi-fact item is marked seen");

  // b) cap: an item's facts go in together or wait together
  const capRoad = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  const capItems = [{ ...item6("off", "SpaceX update"), tier: "official", src: "SpaceX" }, item6("three", "Three facts")];
  const capCh = road.applyUpdates(capRoad, capItems, [
    { item: 1, box: "date", line: "SpaceX says the launch date is coming soon.", short: "Date soon", status: null },
    { item: 2, box: "pad", line: "Fact one about the pad here.", short: "one", status: null },
    { item: 2, box: "raptor", line: "Fact two about the engines here.", short: "two", status: null },
    { item: 2, box: "cryo", line: "Fact three about cryo testing here.", short: "three", status: null },
  ], () => {}, 2);
  check(capCh.length === 1 && capCh[0].item === capItems[0] && capItems[1].deferred === true, "cap 2: official fact in, the 3-fact item waits as a whole");

  // c) empty reply, then the retry works
  feed6 = [item6("e1", "Ship 42 Raptor installs finished")];
  let before6 = calls.claude;
  claudeScript = [thinkingOnly, textReply([{ item: 1, box: "raptor", line: "Ship 42 has finished Raptor installs.", short: "S42 Raptors installed", status: null, reason: "engines" }])];
  res = await road.run(opts6);
  check(calls.claude - before6 === 2 && res.changes.length === 1 && state6.seen.includes("rss:e1"), "empty reply → retried once → applied and marked seen");

  // d) empty twice: loud error, items NOT marked seen, kept for next run
  feed6 = [item6("e2", "Booster 22 rolls to Massey's")];
  before6 = calls.claude;
  claudeScript = [thinkingOnly, thinkingOnly];
  const logs6 = [];
  const realLog = console.log;
  console.log = (...a) => { logs6.push(a.join(" ")); realLog(...a); };
  res = await road.run(opts6);
  console.log = realLog;
  check(calls.claude - before6 === 2 && res.changes.length === 0, "empty reply twice → 2 calls, no change");
  check(logs6.some((l) => l.includes("CLAUDE EMPTY REPLY — items NOT marked seen")) && logs6.some((l) => /stop_reason: max_tokens/.test(l)), "loud CLAUDE EMPTY REPLY error and stop_reason logged");
  check(!state6.seen.includes("rss:e2") && state6.pending.some((p) => p.key === "rss:e2"), "the item is NOT marked seen and waits in pending");
  feed6 = [];
  claudeScript = [textReply([{ item: 1, box: "pad", line: "Booster 22 rolled to Massey's.", short: "B22 at Massey's", status: null, reason: "move" }])];
  res = await road.run(opts6);
  check(res.changes.length === 1 && state6.seen.includes("rss:e2"), "next run: the waiting item is processed");

  console.log("\n────────── RUN 7: Complete (green) status ──────────");
  const cr = road.freshRoad(15);
  const ccryo = cr.categories.find((c) => c.id === "cryo");
  ccryo.status = "progress"; ccryo.latest = "B22 cryo testing under way";
  ccryo.history = [{ date: "1 Oct", text: "No new cryo testing news since the last update.", src: "Tracker check", source: "manual-check", trust: "trusted", kind: "check" },
    { date: "28 Sep", text: "B22 at Massey's for cryo testing.", src: "NSF", source: "nsf", trust: "trusted" }];
  const citem = (n, tier = "trusted", src = "NSF") => ({ key: `c${n}`, title: `c${n}`, src, source: src.toLowerCase(), tier, url: `https://example.com/c${n}`, publishedAt: new Date(Date.now() - (10 - n) * 60000).toISOString() });
  const cItems = [1, 2, 3, 4, 5, 6].map((n) => citem(n));
  cItems[3] = citem(4, "unconfirmed", "@fan");
  let cch = road.applyUpdates(cr, cItems, [{ item: 1, box: "cryo", line: "Both B22 and S42 have completed cryo testing.", short: "Cryo testing complete", status: "complete" }], () => {}, 5);
  check(ccryo.status === "complete" && ccryo.latest === "Done" && cch[0].to === "complete" && ccryo.history[0].complete === true && !ccryo.history.slice(1).some((h) => h.complete), "source says the stage is done → status complete, headline \"Done\", that entry flagged complete: true");
  check(!ccryo.history.some((h) => h.kind === "check") && ccryo.history[0].key === "c1", "real news landed → the box's \"no news yet\" line is deleted");
  check(cch.length === 1 && /Cryo tests: Done$/.test(road.notificationFor(cr, cch[0]).title), "push title says Done");
  cch = road.applyUpdates(cr, cItems, [{ item: 2, box: "cryo", line: "Booster 22 is back at Massey's for more cryo testing.", short: "B22 back for more cryo", status: "progress" }], () => {}, 5);
  check(ccryo.status === "progress" && ccryo.latest === "B22 back for more cryo" && ccryo.history[0].key === "c2" && ccryo.history[1].key === "c1", "trusted source re-opens it → In progress, new entry on top, the Complete entry stays below");
  cch = road.applyUpdates(cr, cItems, [{ item: 4, box: "cryo", line: "A fan says Booster 22 finished cryo again.", short: "x", status: "complete" }], () => {}, 5);
  check(ccryo.status === "progress" && ccryo.history[0].trust === "unconfirmed", "unconfirmed source can't mark it complete");
  cch = road.applyUpdates(cr, cItems, [{ item: 3, box: "cryo", line: "Booster 22 has completed its extra cryo testing.", short: "B22 extra cryo done", status: "complete" }], () => {}, 5);
  check(ccryo.status === "complete" && ccryo.latest === "Done" && ccryo.history.filter((h) => h.complete).map((h) => h.key).sort().join() === "c1,c3", "completed again → \"Done\" again, new completion entry flagged, re-open and unconfirmed entries not");
  check(ccryo.history.length === 5 && ccryo.history.every((h) => h.src), `full timeline kept, every entry with its source (${ccryo.history.map((h) => `${h.src}`).join(", ")})`);
  const cdate = cr.categories.find((c) => c.id === "date"), cfaa = cr.categories.find((c) => c.id === "faa");
  road.applyUpdates(cr, cItems, [{ item: 5, box: "date", line: "NSF says the launch date is set for 21 October.", short: "21 Oct", status: "complete" }, { item: 6, box: "faa", line: "FAA modification is reportedly done for Flight 15.", short: "y", status: "done" }], () => {}, 5);
  check(cdate.status === "none" && cfaa.status === "none", "\"complete\" ignored for Launch date, \"done\" ignored for the other boxes");
  const lr = road.freshRoad(15);
  const lItems = [{ ...citem(7), tier: "official", src: "SpaceX", source: "spacex" }];
  const lch = road.applyUpdates(lr, lItems, [{ item: 1, box: "date", line: "SpaceX is targeting 21 Oct for Flight 15.", short: "SpaceX targeting 21 Oct", status: "done" }], () => {}, 5);
  const ldate = lr.categories.find((c) => c.id === "date");
  check(ldate.status === "done" && lch.length === 1 && road.notificationFor(lr, lch[0]).title === "🗓️ Launch date: Confirmed" && !ldate.history[0].complete, "Launch date box (hidden in the app) still processed: SpaceX date → Confirmed, push \"🗓️ Launch date: Confirmed\"");
  let threw2 = false; try { road.validateRoad({ ...cr, categories: cr.categories.map((c) => (c.id === "date" ? { ...c, status: "complete" } : c)) }); } catch { threw2 = true; }
  check(threw2, "validateRoad refuses a Complete Launch date");

  console.log("\n────────── RUN 8: \"no news yet\" lines are placeholders ──────────");
  const today = road.fmtDay();
  const nr = (h) => ({ date: h[0], text: h[1], src: h[2] || "NSF", source: "nsf", trust: "trusted", ...(h[3] || {}) });
  const ck = (date, text) => ({ date, text, src: "Tracker check", source: "manual-check", trust: "trusted", kind: "check" });
  const mk = () => ({ flight: 15, vehicles: [], categories: [
    { id: "raptor", status: "progress", history: [ck("7 Oct", "No report yet of Raptor installs finishing."), nr(["30 Sep", "Both being fitted with Raptors."])] },
    { id: "pad", status: "progress", history: [nr(["9 Oct", "Pad 2's chopsticks are undergoing maintenance.", "NSF", { at: "2026-10-08T23:00:08.000Z" }]), ck("7 Oct", "No rollout reported yet.")] },
    { id: "cryo", status: "done", history: [nr(["6 Oct", "Both vehicles passed cryo."])] },
    { id: "static", status: "pending", history: [nr(["30 Sep", "B22 static fire in ~2 weeks."])] },
    { id: "faa", status: "pending", history: [ck("8 Oct", "No FAA news A."), ck("7 Oct", "No FAA news B."), nr(["26 Sep", "Licence for Flight 14 only."])] },
    { id: "date", status: "pending", history: [] },
  ] });
  const u = mk();
  const ub = (id) => u.categories.find((c) => c.id === id);
  const realOf = (rd) => JSON.stringify(rd.categories.map((c) => c.history.filter((h) => h.kind !== "check")));
  const realU = realOf(u);
  const day9 = new Date("2026-10-09T12:00:00Z");
  const ch9 = road.refreshCheckDates(u, day9);
  check(ub("raptor").history[0].kind === "check" && ub("raptor").history[0].date === "9 Oct" && ub("raptor").history[0].text === "No report yet of Raptor installs finishing.", "standing line keeps its wording, date rolls to today (7 Oct → 9 Oct)");
  check(!ub("pad").history.some((h) => h.kind === "check"), "real news on 9 Oct → no check line on 9 Oct (removed)");
  check(!ub("cryo").history.some((h) => h.kind === "check") && !ub("date").history.length, "finished box and empty box → no check line");
  check(ub("static").history[0].kind === "check" && ub("static").history[0].date === "9 Oct" && ub("static").history[0].text === road.CHECK_TEXT.static, `quiet box without one gets the default line: "${road.CHECK_TEXT.static}"`);
  check(ub("faa").history.filter((h) => h.kind === "check").length === 1 && ub("faa").history[0].text === "No FAA news A.", "never more than one check line per box");
  check(realOf(u) === realU, "real entries untouched (dates, text, order)");
  check(road.refreshCheckDates(u, new Date("2026-10-09T22:59:00Z")).length === 0, "again the same London day → no-op");
  const ch10 = road.refreshCheckDates(u, new Date("2026-10-09T23:30:00Z")); // 00:30 on 10 Oct in London
  check(ub("pad").history[0].kind === "check" && ub("pad").history[0].date === "10 Oct" && ub("pad").history[0].text === road.CHECK_TEXT.pad && ub("pad").history[1].date === "9 Oct", "next London day (10 Oct) → Pad's check line re-appears on top, real 9 Oct entry below");
  check(ub("raptor").history[0].date === "10 Oct" && ub("static").history[0].date === "10 Oct" && realOf(u) === realU, "standing lines roll to 10 Oct, real entries untouched");
  const ch11 = road.refreshCheckDates(u, new Date("2026-10-11T08:00:00Z"));
  check(ch11.length === 4 && ch11.every((m) => m.action === "moved" && m.to === "11 Oct"), "and roll again on 11 Oct");

  // full runs on a copy of the real road.json
  const tmp8 = fs.mkdtempSync(path.join(os.tmpdir(), "road-test8-"));
  const road8 = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
  for (const c of road8.categories) for (const h of c.history) if (h.kind === "check") h.date = "1 Oct";
  road8.updated = "1 Oct"; road8.updatedAt = "2026-10-01T10:00:00Z";
  fs.writeFileSync(path.join(tmp8, "road.json"), JSON.stringify(road8, null, 2) + "\n");
  fs.copyFileSync(path.join(ROOT, "app.js"), path.join(tmp8, "app.js"));
  const real8 = realOf(road8);
  const sent8 = [], commits8 = [];
  let state8 = { seen: [] };
  const opts8 = {
    mode: "dry-run", roadPath: path.join(tmp8, "road.json"), appJsPath: path.join(tmp8, "app.js"),
    commit: (f, m) => commits8.push(m), sources: [{ name: "fake", fetch: async () => [] }],
    deps: { loadState: async () => JSON.parse(JSON.stringify(state8)), saveState: async (st) => { state8 = JSON.parse(JSON.stringify(st)); }, push: async (n) => sent8.push(n) },
  };
  const raw8 = fs.readFileSync(opts8.roadPath, "utf8");
  const logs8 = [];
  const realLog8 = console.log;
  console.log = (...a) => { logs8.push(a.join(" ")); realLog8(...a); };
  res = await road.run({ ...opts8, mode: "preview" });
  console.log = realLog8;
  check(fs.readFileSync(opts8.roadPath, "utf8") === raw8 && !commits8.length && !sent8.length && logs8.some((l) => /DATE REFRESH \[faa\] .* 1 Oct → /.test(l)), "test mode: logs the changes, writes/commits/sends nothing");
  res = await road.run(opts8);
  const r8 = JSON.parse(fs.readFileSync(opts8.roadPath, "utf8"));
  const checks8 = r8.categories.filter((c) => c.history.some((h) => h.kind === "check"));
  check(checks8.every((c) => c.history.filter((h) => h.kind === "check").length === 1 && c.history[0].kind === "check" && c.history[0].date === today), `each quiet box has one no-news line, on top, dated ${today} (${checks8.map((c) => c.id).join(", ")})`);
  check(realOf(r8) === real8, "real news entries untouched (dates, text, order)");
  check(r8.updated === today, `card "Updated" moved to ${r8.updated}`);
  check(commits8.length === 1 && /no-news lines/.test(commits8[0]) && sent8.length === 0 && res.notifications.length === 0, `placeholder-only change → one commit ("${commits8[0]}"), NO push`);
  const raw8b = fs.readFileSync(opts8.roadPath, "utf8");
  res = await road.run(opts8);
  check(fs.readFileSync(opts8.roadPath, "utf8") === raw8b && commits8.length === 1 && sent8.length === 0, "next run the same day → no-op (no write, no commit, no push)");
  res = await road.run({ ...opts8, sources: [{ name: "fake", fetch: async () => [item6("r8", "Booster 22 static fire")] }], askClaude: async () => [{ item: 1, box: "static", line: "Booster 22 completed a static fire.", short: "B22 static fire done", status: "progress" }] });
  const st8 = JSON.parse(fs.readFileSync(opts8.roadPath, "utf8")).categories.find((c) => c.id === "static");
  check(st8.history[0].key === "rss:r8" && !st8.history.some((h) => h.kind === "check") && sent8.length === 1, "real news lands → on top with its true date, the box's no-news line is deleted, one push");

  console.log(`\nClaude called ${calls.claude}x, X search called ${calls.x}x (all fake).`);
  console.log(failed ? `\n❌ ${failed} check(s) failed` : "\n✅ All checks passed. (Dry run only — nothing real was saved, committed or sent.)");
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
