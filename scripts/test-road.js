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

// Fake Claude: reads the numbered items in the real prompt and answers like Claude would.
const CANNED = [
  [/Booster 22 completes static fire/, { box: "static", line: "Booster 22 completed a static fire at Massey's.", short: "B22 static fire done, S42 still to go", status: "progress" }],
  [/FAA approves/, { box: "faa", line: "FAA has modified the licence to cover Flight 15.", short: "Licence now covers Flight 15", status: "done" }],
  [/could roll to Pad 2/, { box: "pad", line: "Ship 42 may roll to Pad 2 this weekend, per unnamed sources.", short: "S42 may roll to Pad 2", status: "progress" }],
  [/returns to Massey's for more cryo/, { box: "cryo", line: "Booster 22 back at Massey's for more cryo testing.", short: "B22 back at Massey's for more cryo", status: "progress" }],
  [/cryo test may have failed/, { box: "cryo", line: "A post asks if S42's cryo test failed. Not confirmed.", short: "x", status: "pending" }],
  [/targeting 21 October/, { box: "date", line: "SpaceX is targeting 21 Oct, window opens 23:00 UTC.", short: "SpaceX targeting 21 Oct", status: "done" }],
  [/Ship 42 static fire at Massey's/, { box: "static", line: "Ship 42 completed a static fire at Massey's.", short: "S42 static fire done", status: "done" }],
];
function fakeClaude(prompt) {
  calls.claude++;
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
  const opts = { mode: "dry-run", roadPath, appJsPath, deps, commit: (f, m) => { commits.push(m); console.log(`(fake commit) ${m}`); } };

  console.log("\n────────── RUN 1: normal run with a mix of posts ──────────");
  let res = await road.run(opts);
  let r = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  check(res.changes.length === 5, `capped at 5 changes this run (got ${res.changes.length})`);
  check(sent.length === 5 && commits.length === 1, `one push per change (${sent.length}) and one commit (${commits.length})`);
  check(box(r, "date").status === "done" && box(r, "date").history[0].src === "SpaceX", "SpaceX post on X → Launch date Confirmed (official source)");
  check(box(r, "faa").status === "done" && box(r, "faa").history[0].src === "SpaceNews", "SpaceNews (trusted) → FAA licence Done");
  const st = box(r, "static");
  check(st.status === "done" && st.history[0].text.startsWith("Ship 42") && st.history[1].text.startsWith("Booster 22") && st.latest === "S42 static fire done", "B22 then S42 static fires → Static fires Done, newest first, headline updated");
  const cryo = box(r, "cryo");
  check(cryo.status === "done" && cryo.history[0].src === "NSF", "NSF says B22 back for cryo → entry added but Done NOT downgraded (needs SpaceX/FAA)");
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
  check(box(r, "cryo").status === "done" && box(r, "cryo").history[0].trust === "unconfirmed", "unconfirmed X post suggesting a cryo failure → tagged, status stays Done");
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
  const items = [1, 2, 3].map((n) => ({ key: `k${n}`, title: `t${n}`, src: "NSF", source: "nsf", tier: "trusted", publishedAt: ago(n) }));
  road.applyUpdates(hr, items, [{ item: 1, box: "pad", line: "Flight 15 will launch from Starbase.", short: "Flight 15 from Starbase", status: null, supersedes: false }], () => {}, 5);
  check(hpad.latest === "Pad 2 being serviced", "new fact without supersedes → headline kept");
  road.applyUpdates(hr, items, [{ item: 2, box: "pad", line: "Pad 2 servicing finished.", short: "Pad 2 servicing finished", status: null, supersedes: true }], () => {}, 5);
  check(hpad.latest === "Pad 2 servicing finished", "supersedes: true → headline replaced");
  road.applyUpdates(hr, items, [{ item: 3, box: "pad", line: "Ship 42 rolled to Pad 2.", short: "S42 at Pad 2", status: "done" }], () => {}, 5);
  check(hpad.latest === "S42 at Pad 2" && hpad.status === "done", "status change → headline replaced");

  console.log(`\nClaude called ${calls.claude}x, X search called ${calls.x}x (all fake).`);
  console.log(failed ? `\n❌ ${failed} check(s) failed` : "\n✅ All checks passed. (Dry run only — nothing real was saved, committed or sent.)");
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
