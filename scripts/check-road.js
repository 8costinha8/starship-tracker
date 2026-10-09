/* ─────────────────────────────────────────────────────────────
   Keeps the "Road to Flight N" card (road.json) up to date on its own.
   Runs after check-flights.js in .github/workflows/flight-checker.yml.

   Every run it:
     1. Reads news from free sources (SpaceX, FAA, NSF, Spaceflight Now,
        SpaceNews, Spaceflight News API, NSF / LabPadre / SpaceX YouTube,
        Launch Library updates) plus X posts if X_BEARER_TOKEN is set.
     2. Drops anything old, already seen, or clearly not about Starship.
     3. Asks Claude to boil each remaining post down to one short line,
        pick its box (Cryo, Raptor engines, Static fires, Pad activity,
        FAA licence, Launch date) and say if it changes that box's status.
     4. Trust: SpaceX/FAA (official) and big established outlets/trackers
        go in as confirmed. Anything else goes in with an "Unconfirmed"
        tag and never changes a box's status or headline.
     5. Writes road.json, commits + pushes it, then sends one push
        notification per change.
     6. "No news yet" lines (history entries with kind: "check") are
        placeholders, not history: at most one per box, deleted as soon as
        real news lands in that box, and only (re)added from the London day
        AFTER the box's latest real entry. While it stands, its date rolls
        forward to today once per London day. Real entries keep their own
        dates. These placeholder-only changes are committed, never pushed.
   Statuses: none, pending, progress, complete (shown as "Done": the
   source explicitly says the stage is finished; that entry gets
   complete: true and a green tint in the app; a trusted source can
   re-open it), done (legacy "Done", and the Launch date box's "Confirmed").
   The Launch date box is not shown in the app but is still tracked and pushed.
   When the flight it is tracking appears in app.js's FLIGHTS list (that's
   check-flights.js logging the result), it starts a fresh Road to the next
   flight on its own. Its "🚀 Road to Flight N" push is not sent then: it is
   stored as state.pendingPush and sent by the first live run at or after
   09:00 London time the morning after the launch day, then cleared.

   Modes:
     node scripts/check-road.js            live (used by the workflow)
     TEST_MODE=true / ROAD_MODE=preview    real sources + real Claude, but
                                           nothing saved, committed or sent
     node scripts/test-road.js             full dry run: fake sources,
                                           fake Claude, fake Firebase
   ───────────────────────────────────────────────────────────── */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ANTHROPIC_MODEL = "claude-sonnet-5"; // same model as check-flights.js

const LIMITS = {
  itemsToClaude: 12,     // most posts sent to Claude in one run
  changesPerRun: 5,      // most card changes (and so pushes) per run; the rest wait for the next run
  updatesPerItem: 3,     // one item can give at most 3 separate facts
  claudeMaxTokens: 16000, // hard cap on thinking + answer (Sonnet 5 thinks adaptively, no fixed budget)
  claudeRetryMs: 3000,   // wait before retrying an empty/unparseable reply
  historyPerBox: 12,     // older mini-cards drop off the bottom
  staleHours: 72,        // ignore anything published longer ago than this
  seenKeep: 800,         // how many seen-post keys we remember
  ll2EveryMin: 60,       // Launch Library free limit is 15/hour, check-flights already uses some
};

const STATUSES = ["none", "pending", "progress", "done", "complete"];
const RANK = { none: 0, pending: 1, progress: 2, done: 3, complete: 3 };
const STATUS_TEXT = { none: "Not started", pending: "Pending", progress: "In progress", done: "Done", complete: "Done" };
const FINISHED = (s) => s === "done" || s === "complete"; // nothing awaited → no "no news yet" line

// Wording for a new "no news yet" line (an existing one keeps its own wording).
const CHECK_TEXT = {
  cryo: "No new cryo testing news since the last update.",
  raptor: "No new Raptor engine news since the last update.",
  static: "No new static fire news since the last update.",
  pad: "No new pad or vehicle move news since the last update.",
  faa: "No new FAA licence news since the last update.",
  date: "SpaceX has still not announced a date.",
};

// The six boxes. Used to start a fresh Road when the tracked flight flies.
const BOXES = [
  { id: "cryo", icon: "❄️", name: "Cryo tests", color: "#BFE6FF" },
  { id: "raptor", icon: "🔥", name: "Raptor engines", color: "#FF9A3D" },
  { id: "static", icon: "💥", name: "Static fires", color: "#FF5A36" },
  { id: "pad", icon: "🏗️", name: "Pad activity", color: "#A88BFF" },
  { id: "faa", icon: "📜", name: "FAA licence", color: "#2FD3B0" },
  { id: "date", icon: "🗓️", name: "Launch date", color: "#FFC93D", doneText: "Confirmed" },
];

/* ───────────── trust ─────────────
   tier "official" = SpaceX / FAA themselves. Only these can move a box
   backwards or mark the launch date Confirmed.
   tier "trusted"  = big established outlets and Starbase trackers. Shown as fact.
   anything else   = "unconfirmed": shown with the tag, never changes status. */
const DOMAINS = {
  "spacex.com": { src: "SpaceX", source: "spacex", tier: "official" },
  "faa.gov": { src: "FAA", source: "faa", tier: "official" },
  "nasaspaceflight.com": { src: "NSF", source: "nsf", tier: "trusted" },
  "spaceflightnow.com": { src: "Spaceflight Now", source: "spaceflightnow", tier: "trusted" },
  "spacenews.com": { src: "SpaceNews", source: "spacenews", tier: "trusted" },
  "nextspaceflight.com": { src: "Next Spaceflight", source: "next-spaceflight", tier: "trusted" },
  "spacepolicyonline.com": { src: "SpacePolicyOnline", source: "spacepolicyonline", tier: "trusted" },
  "arstechnica.com": { src: "Ars Technica", source: "arstechnica", tier: "trusted" },
  "reuters.com": { src: "Reuters", source: "reuters", tier: "trusted" },
  "cnbc.com": { src: "CNBC", source: "cnbc", tier: "trusted" },
  "space.com": { src: "Space.com", source: "space-com", tier: "trusted" },
  "nasa.gov": { src: "NASA", source: "nasa", tier: "trusted" },
  "labpadre.com": { src: "LabPadre", source: "labpadre", tier: "trusted" },
};
// X accounts we read (if X_BEARER_TOKEN is set) and how far we trust them.
// id = the account's X user id (checked with the X API users/by lookup, 9 Oct 2026),
// so no paid user lookup is needed. An account without an id is looked up once as before.
const X_ACCOUNTS = {
  SpaceX: { src: "SpaceX", tier: "official", id: "34743251" },
  FAANews: { src: "FAA", tier: "official", id: "160946337" },
  NASASpaceflight: { src: "NSF", tier: "trusted", id: "21292523" },
  BocaChicaGal: { src: "NSF", tier: "trusted", id: "1077756486997168128" },
  StarbaseWatcher: { src: "Starbase Watcher", tier: "trusted", id: "1416984433979138051" },
  LabPadre: { src: "LabPadre", tier: "trusted", id: "1110905864578363394" },
  RGVaerialphotos: { src: "RGV Aerial", tier: "trusted", id: "752724282925412352" },
  SpaceflightNow: { src: "Spaceflight Now", tier: "trusted", id: "17217640" },
  SpaceNews_Inc: { src: "SpaceNews", tier: "trusted", id: "31098756" },
  thesheetztweetz: { src: "CNBC", tier: "trusted", id: "1231406720" },
};
// Spaceflight News API "news_site" names we trust (others come in unconfirmed).
const SNAPI_TRUSTED = {
  NASASpaceflight: "nasaspaceflight.com", "Spaceflight Now": "spaceflightnow.com", SpaceNews: "spacenews.com",
  "SpacePolicyOnline.com": "spacepolicyonline.com", "Ars Technica": "arstechnica.com", Reuters: "reuters.com",
  CNBC: "cnbc.com", "Space.com": "space.com", NASA: "nasa.gov", SpaceX: "spacex.com",
};

function trustForUrl(url) {
  let host = "";
  try { host = new URL(url).hostname.replace(/^www\.|^m\./, ""); } catch { return null; }
  if (host === "x.com" || host === "twitter.com") {
    const handle = (new URL(url).pathname.split("/")[1] || "");
    const hit = Object.keys(X_ACCOUNTS).find((h) => h.toLowerCase() === handle.toLowerCase());
    if (hit) return { ...X_ACCOUNTS[hit], source: `x:${hit}` };
    return { src: `@${handle}`, source: `x:${handle}`, tier: "unconfirmed" };
  }
  const key = Object.keys(DOMAINS).find((d) => host === d || host.endsWith("." + d));
  return key ? DOMAINS[key] : { src: host, source: host, tier: "unconfirmed" };
}
const isTrusted = (tier) => tier === "official" || tier === "trusted";

/* ───────────── small helpers ───────────── */

const sha = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 12);
const UA = "StarshipTracker/1.0 (+https://8costinha8.github.io/starship-tracker/)";

// "8 Oct" in London time
function fmtDay(iso) {
  const d = iso ? new Date(iso) : new Date();
  const day = d.toLocaleString("en-GB", { day: "numeric", timeZone: "Europe/London" });
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "Europe/London" });
  return `${day} ${month.replace("Sept", "Sep")}`;
}

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8220;|&ldquo;/g, "“").replace(/&#8221;|&rdquo;/g, "”").replace(/&#8211;|&ndash;/g, "–").replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

async function fetchText(url, opts = {}) {
  let lastErr;
  for (let i = 1; i <= 2; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { "user-agent": UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (err) {
      lastErr = err;
      if (i < 2) await new Promise((ok) => setTimeout(ok, 3000));
    }
  }
  throw lastErr;
}
const fetchJson = async (url, opts) => JSON.parse(await fetchText(url, opts));

// Minimal RSS/Atom reader, no dependencies.
function parseFeed(xml) {
  const tag = (b, name) => { const m = b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ""; };
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  return blocks.map((b) => ({
    title: decode(tag(b, "title")),
    url: decode(tag(b, "link")) || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "",
    guid: decode(tag(b, "guid")) || decode(tag(b, "id")),
    publishedAt: toIso(decode(tag(b, "pubDate")) || decode(tag(b, "published")) || decode(tag(b, "updated"))),
    summary: decode(tag(b, "description")) || decode(tag(b, "media:description")) || decode(tag(b, "summary")),
    content: decode(tag(b, "content:encoded")),
  }));
}
function toIso(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(/\bSept\b\.?/, "Sep").replace(/(\w{3})\w*\.\s/, "$1 "));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// Drops YouTube/RSS boilerplate (links, hashtags, licensing, sponsor lists)
// so it can't make an off-topic post look like Starship news.
// YouTube chapter lists ("0:37 Pad 2 Dancefloor Installed 1:07 ...") become
// "Chapter: Pad 2 Dancefloor Installed." sentences, timestamps dropped.
const TS = /(?:^|\s)\d{1,2}:\d{2}(?::\d{2})?(?=\s)/g;
function videoChapters(text) {
  const t = String(text || "");
  const start = t.search(/(?:Timestamps|Chapters)\s*:|(?:^|\s)0:00\s/i);
  if (start < 0) return "";
  let seg = t.slice(start).replace(/^\s*(?:Timestamps|Chapters)\s*:/i, " ");
  const end = seg.search(/LDAPAABJRG2UMCU3|Licensed via|If you are interested in using footage|All content copyright|https?:\/\//i);
  if (end >= 0) seg = seg.slice(0, end);
  if ((seg.match(TS) || []).length < 2) return "";
  return seg.split(TS).slice(1).map((c) => c.replace(/\s+/g, " ").trim()).filter((c) => c && c.length <= 80).slice(0, 25)
    .map((c) => `Chapter: ${c.replace(/[.\s]+$/, "")}.`).join(" ");
}

function stripBoilerplate(text) {
  const chapters = videoChapters(text);
  let t = String(text || "")
    .replace(/The post .{0,200}? appeared first on [^.]*\.?/gi, " ")
    .replace(/See Also .{0,300}?Click here to Join L2/gi, " ");
  const cut = t.search(/Licensed via|LDAPAABJRG2UMCU3|If you are interested in using footage|All content copyright|All images are explicitly owned|If you would like to get involved|Join L2 and support|Timestamps:|Support us on Patreon|Become a member of|NSF Store:|Thanks for watching/i);
  if (cut >= 0) t = t.slice(0, cut);
  if (chapters) t = `${t} ${chapters}`;
  return t.replace(/https?:\/\/\S+/g, "").replace(/(^|\s)#\w+/g, " ").replace(/🔗|⚡|🔍|🎵/g, "").replace(/\s+/g, " ").trim();
}

// Long articles: keep the sentences about this flight's vehicles first, then
// other Starship-prep sentences, so Claude sees the relevant bits only.
function relevantSnippet(text, road, max = 1200) {
  const clean = stripBoilerplate(text);
  const first = vehicleWords(road).concat([`flight ${road.flight}`]).map((w) => w.toLowerCase());
  const second = ["static fire", "cryo", "raptor", "faa", "licen", "rollout", "roll out", "rolled", "stack", "pad 1", "pad 2", "launch date", "net ", "massey", "mega bay", "chopstick"];
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const has = (s, words) => words.some((w) => s.toLowerCase().includes(w));
  const picked = new Set(sentences.filter((s) => has(s, first)));
  let len = [...picked].join(" ").length;
  for (const s of sentences) { if (len >= max) break; if (!picked.has(s) && has(s, second)) { picked.add(s); len += s.length + 1; } }
  const out = [...picked].join(" "); // this flight's sentences first
  return (out || clean).slice(0, max);
}
function vehicleWords(road) {
  const out = [];
  for (const v of road.vehicles || []) {
    const m = v.match(/^([BS])(\d+)$/i);
    if (!m) continue;
    out.push(v, m[1].toUpperCase() === "B" ? `Booster ${m[2]}` : `Ship ${m[2]}`);
  }
  return out;
}
function looksRelevant(text, road) {
  const t = String(text || "");
  if (/starship|super ?heavy|starbase|massey|mega ?bay/i.test(t)) return true;
  if (new RegExp(`flight\\s*${road.flight}\\b`, "i").test(t) && /spacex|raptor|booster|ship/i.test(t)) return true;
  return vehicleWords(road).some((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
}

/* ───────────── sources ─────────────
   Each returns items: { key, title, text, url, publishedAt, src, source, tier } */

function rssSource(name, url, fixed) {
  return {
    name,
    async fetch(road) {
      const items = parseFeed(await fetchText(url));
      return items.map((it) => {
        const t = fixed || trustForUrl(it.url) || {};
        return {
          key: `rss:${it.guid || it.url}`, title: it.title,
          text: relevantSnippet(`${stripBoilerplate(it.summary)} ${stripBoilerplate(it.content)}`, road),
          url: it.url, publishedAt: it.publishedAt, src: t.src, source: t.source, tier: t.tier,
        };
      });
    },
  };
}

const SOURCES = [
  rssSource("NSF", "https://www.nasaspaceflight.com/feed/", DOMAINS["nasaspaceflight.com"]),
  rssSource("Spaceflight Now", "https://spaceflightnow.com/feed/", DOMAINS["spaceflightnow.com"]),
  rssSource("SpaceNews", "https://spacenews.com/feed/", DOMAINS["spacenews.com"]),
  rssSource("NSF YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=UCSUu1lih2RifWkKtDOJdsBA", { src: "NSF", source: "nsf-youtube", tier: "trusted" }),
  rssSource("LabPadre YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=UCFwMITSkc1Fms6PoJoh1OUQ", { src: "LabPadre", source: "labpadre-youtube", tier: "trusted" }),
  rssSource("SpaceX YouTube", "https://www.youtube.com/feeds/videos.xml?channel_id=UCtI0Hodo5o5dUb67FeUjDeA", { src: "SpaceX", source: "spacex-youtube", tier: "official" }),

  { // Aggregates many outlets; trust depends on which outlet wrote it.
    name: "Spaceflight News API",
    async fetch(road) {
      const j = await fetchJson("https://api.spaceflightnewsapi.net/v4/articles/?search=starship&ordering=-published_at&limit=20");
      return (j.results || []).map((a) => {
        const dom = SNAPI_TRUSTED[a.news_site];
        const t = dom ? DOMAINS[dom] : { src: a.news_site, source: `snapi:${a.news_site}`, tier: "unconfirmed" };
        return { key: `url:${a.url}`, title: a.title, text: relevantSnippet(a.summary, road), url: a.url, publishedAt: a.published_at, ...t };
      });
    },
  },

  { // SpaceX's own news posts
    name: "SpaceX updates",
    async fetch(road) {
      const list = await fetchJson("https://content.spacex.com/api/spacex-website/updates");
      return (list || []).map((u) => {
        const text = (u.contentBlocks || []).map((b) => [b.heading, b.paragraph, ...(b.listItems || []).map((li) => li.text || li.content || "")].filter(Boolean).join(" ")).join(" ");
        return {
          key: `spacex-update:${u.updateId}`, title: decode(u.title), text: relevantSnippet(decode(text), road),
          url: `https://www.spacex.com/updates#${u.updateId}`, publishedAt: u.date ? `${u.date}T12:00:00Z` : null, timeKnown: false, ...DOMAINS["spacex.com"],
        };
      });
    },
  },

  { // SpaceX launches page: a Starship tile with a date = SpaceX has announced it
    name: "SpaceX launches page",
    async fetch(road) {
      const tiles = await fetchJson("https://content.spacex.com/api/spacex-website/launches-page-tiles/upcoming");
      // the date can sit in launchDate or only in override.text ("October 8, 2026 00:54 PT").
      // Titles are "Starship Flight 14" or "Starship's Thirteenth Flight Test", so read
      // the flight number from the link ("starship-flight-15") first.
      const when = (t) => t.launchDate ? `${t.launchDate}${t.launchTime ? ` at ${t.launchTime} UTC` : ""}` : (t.override && t.override.text) || "";
      const flightNo = (t) => Number((`${t.link} ${t.title}`.match(/flight[-\s]*(\d+)/i) || [])[1]) || null;
      return (Array.isArray(tiles) ? tiles : [])
        .filter((t) => /starship/i.test(`${t.vehicle} ${t.missionType} ${t.title}`) && when(t))
        .filter((t) => { const n = flightNo(t); return !n || n === road.flight; })
        .map((t) => ({
          key: `spacex-tile:${t.id}:${when(t)}`,
          title: `SpaceX launches page: ${t.title}`,
          text: `SpaceX's own launches page lists "${t.title}" (${t.vehicle}) on ${when(t)} from ${t.launchSite || "Starbase"}.`,
          url: `https://www.spacex.com/launches/${t.link}`, publishedAt: new Date().toISOString(), timeKnown: false, ...DOMAINS["spacex.com"],
        }));
    },
  },

  { // FAA press statements (licence approvals, mishap closures)
    name: "FAA statements",
    async fetch(road) {
      const html = await fetchText("https://www.faa.gov/newsroom/statements/general-statements");
      const start = html.indexOf("Recent Statements");
      const parts = (start >= 0 ? html.slice(start) : html).split(/<h3[^>]*>/).slice(1);
      return parts.map((p) => {
        const date = decode(p.split("</h3>")[0]);
        const body = p.split("</h3>")[1] || "";
        const title = decode((body.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || "");
        const text = decode(body.split(/<h2/)[0]);
        return { key: `faa:${date}:${sha(title)}`, title, text: text.slice(0, 900), url: "https://www.faa.gov/newsroom/statements/general-statements", publishedAt: toIso(date), timeKnown: false, ...DOMAINS["faa.gov"] };
      }).filter((it) => /starship|spacex|starbase|boca chica/i.test(`${it.title} ${it.text}`));
    },
  },

  { // Launch Library 2 updates on this flight (editors often link X posts). Once an hour max.
    name: "Launch Library updates",
    async fetch(road, state) {
      if (state.ll2At && Date.now() - state.ll2At < LIMITS.ll2EveryMin * 60000) return [];
      state.ll2At = Date.now();
      const j = await fetchJson("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=5&mode=detailed");
      const launch = (j.results || []).find((l) => Number((l.name.match(/Flight\s*(\d+)/i) || [])[1]) === road.flight);
      return ((launch && launch.updates) || []).map((u) => {
        const t = trustForUrl(u.info_url) || { src: "Launch Library", source: "ll2", tier: "unconfirmed" };
        return { key: `ll2:${u.id}`, title: decode(u.comment), text: `Launch Library note on Flight ${road.flight}: ${decode(u.comment)}`, url: u.info_url, publishedAt: u.created_on, ...t, source: `ll2>${t.source}` };
      });
    },
  },

  { // X (official API, pay-per-use). Only runs if X_BEARER_TOKEN is set.
    name: "X",
    async fetch(road, state) {
      const token = process.env.X_BEARER_TOKEN;
      if (!token) return [];
      const auth = { headers: { authorization: `Bearer ${token}` } };
      // 1. handle -> user id, looked up once and remembered (user reads cost extra)
      state.xUserIds = state.xUserIds || {};
      for (const [h, a] of Object.entries(X_ACCOUNTS)) if (a.id) state.xUserIds[h] = a.id; // hard-coded ids win
      const missing = Object.keys(X_ACCOUNTS).filter((h) => !state.xUserIds[h]);
      if (missing.length) {
        const u = await fetchJson(`https://api.x.com/2/users/by?usernames=${missing.join(",")}`, auth);
        for (const user of u.data || []) {
          const h = Object.keys(X_ACCOUNTS).find((k) => k.toLowerCase() === user.username.toLowerCase());
          if (h && missing.includes(h)) state.xUserIds[h] = user.id;
        }
        for (const h of missing) if (!state.xUserIds[h]) state.xUserIds[h] = "none"; // doesn't exist; don't look up again
      }
      const byId = Object.fromEntries(Object.entries(state.xUserIds).filter(([, id]) => id !== "none").map(([h, id]) => [id, h]));
      // 2. one search for Starship posts from those accounts since last time.
      //    You only pay for posts that come back, so quiet runs cost nothing.
      const words = ["Starship", `"Flight ${road.flight}"`, ...vehicleWords(road).map((w) => (w.includes(" ") ? `"${w}"` : w))];
      const from = Object.keys(X_ACCOUNTS).filter((h) => state.xUserIds[h] !== "none").map((h) => `from:${h}`);
      const query = `(${from.join(" OR ")}) (${words.join(" OR ")}) -is:retweet -is:reply`;
      const params = new URLSearchParams({ query, max_results: "25", "tweet.fields": "created_at,author_id" });
      if (state.xSinceId) params.set("since_id", state.xSinceId);
      else params.set("start_time", new Date(Date.now() - 6 * 3600000).toISOString());
      const j = await fetchJson(`https://api.x.com/2/tweets/search/recent?${params}`, auth);
      if (j.meta && j.meta.newest_id) state.xSinceId = j.meta.newest_id;
      return (j.data || []).map((p) => {
        const handle = byId[p.author_id] || "unknown";
        const t = X_ACCOUNTS[handle] || { src: `@${handle}`, tier: "unconfirmed" };
        return { key: `x:${p.id}`, title: `@${handle} on X`, text: decode(p.text).slice(0, 600), url: `https://x.com/${handle}/status/${p.id}`, publishedAt: p.created_at, src: t.src, source: `x:${handle}`, tier: t.tier };
      });
    },
  },
];

/* ───────────── Claude: simplify + classify ───────────── */

function buildPrompt(road, items) {
  const v = road.vehicles && road.vehicles.length ? road.vehicles.join(" and ") : "not yet known";
  const hint = { date: " (done = SpaceX has announced the date; never complete)", pad: " (also launch site and pad assignment, and vehicle moves and locations: rollouts, rollbacks, stacking/destacking, which booster or ship is where)" };
  const boxes = road.categories.map((c) => `- ${c.id} (${c.name}): ${c.status}${hint[c.id] || ""}. Headline: "${c.latest}"`).join("\n");
  const recent = road.categories.flatMap((c) => (c.history || []).filter((h) => !isCheck(h)).slice(0, 3).map((h) => `- [${c.id}] ${h.date}: ${h.text}`)).join("\n");
  const list = items.map((it, i) => `${i + 1}. [${it.src}, ${fmtDay(it.publishedAt)}] ${it.title} — ${it.text}`).join("\n");
  return `You simplify Starship news into one-line updates for a small box in a tracker app called "Road to Flight ${road.flight}" (vehicles: ${v}).

Boxes, current status (none, pending, progress, complete; Launch date uses done) and headline:
${boxes}

Already in the boxes (don't repeat):
${recent}

For each item below, decide if it reports something concrete about Flight ${road.flight}'s vehicles, pad work, launch site, FAA licence or launch date. Most items won't; skip those. An item can give up to 3 separate facts: add one entry per fact, each with its own box, line and reason.

"line": simplify what the item says into one short plain sentence, max 100 characters. Only reword and shorten. No facts, framing or contrasts the item doesn't state (e.g. not "…, not Florida" when it only says a later flight may go there), no guesses, totals or numbers it doesn't give, and no hype. Keep every hedge: if the item says potentially, may, might, could, expected, planned (when hedged) or reportedly, the line keeps that hedge; never turn it into certainty. British English. Payloads are "deployed", never "released".
"short": the same in 4-9 words, no full stop.
"status": the status this item shows for that box, or null if it doesn't change it. Use "complete" ONLY when the item explicitly says that stage is finished for Flight ${road.flight}'s vehicles (e.g. "both vehicles have completed cryo testing"); never infer or invent it (one vehicle done, a test happening, or an estimate is "progress"). If a completed stage restarts or needs more work (e.g. the booster goes back for more cryo), say "progress". For the Launch date box, "done" means SpaceX has announced the date; never use "complete" there, and never use "done" for the other boxes.
"supersedes": true only if this clearly replaces the box's current headline (e.g. a later step of the same thing), otherwise false.
"reason": why, in max 12 words. For each item you skip, add {"item": n, "skip": true, "reason": "..."}.${road.vehicles && road.vehicles.length ? "" : `
If an item says which booster and ship will fly Flight ${road.flight}, also add {"item": n, "vehicles": ["B23", "S43"]}.`}

Reply with ONLY a JSON array, one or more entries per item, e.g. [{"item": 1, "box": "static", "line": "...", "short": "...", "status": "progress", "supersedes": false, "reason": "..."}, {"item": 2, "skip": true, "reason": "about Flight 14, not ${road.flight}"}].

Items:
${list}`;
}

// Sonnet 5 thinks adaptively (no budget_tokens; that's a 400). max_tokens covers
// thinking + answer, so it's set well above what this small task needs.
// An empty or unparseable reply is retried once; then err.empty = true.
async function askClaude(prompt, log = console.log) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: LIMITS.claudeMaxTokens, messages: [{ role: "user", content: prompt }] }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`Anthropic API error (${json.error.type}): ${String(json.error.message).slice(0, 2000)}`);
    const blocks = (json.content || []).map((b) => b.type).join(",") || "none";
    log(`Claude stop_reason: ${json.stop_reason} (attempt ${attempt}, blocks: ${blocks}, output tokens: ${json.usage?.output_tokens ?? "?"})`);
    const text = json.content?.find((b) => b.type === "text")?.text;
    let problem;
    if (!text || !text.trim()) problem = "no text in the reply";
    else {
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1));
        if (!Array.isArray(parsed)) throw new Error("not a JSON array");
        Object.defineProperty(parsed, "raw", { value: text, enumerable: false }); // logged in preview only
        return parsed;
      } catch (err) { problem = `unparseable reply (${err.message})`; }
    }
    // thinking signatures are long base64; show their size instead
    const body = JSON.stringify({ ...json, content: (json.content || []).map((b) => (b.signature ? { ...b, signature: `[${b.signature.length} chars]` } : b)) });
    log(`Claude reply problem: ${problem}${attempt < 2 ? " — retrying once" : ""}. Body: ${body.slice(0, 2000)}`);
    if (attempt < 2) await new Promise((ok) => setTimeout(ok, LIMITS.claudeRetryMs));
    else { const err = new Error(`${problem}, twice`); err.empty = true; throw err; }
  }
}

// {"item": n, "skip": true, "reason": "..."} only explains a skip. "reason" is never stored.
const isSkip = (u) => !!u && typeof u === "object" && (u.skip === true || (u.box == null && u.line == null && u.vehicles == null));

// Tidy one line for the box. Returns null if it's unusable.
function cleanLine(s, { fullStop }) {
  let t = String(s || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().replace(/^["'“]|["'”]$/g, "");
  if (t.length < 8) return null;
  if (/satellite|starlink|payload/i.test(t)) t = t.replace(/\breleas(e|ed|es|ing)\b/gi, (m, e) => ({ e: "deploy", ed: "deployed", es: "deploys", ing: "deploying" }[e.toLowerCase()]));
  if (t.length > 140) t = t.slice(0, 137).replace(/\s+\S*$/, "") + "…";
  t = t.replace(/[.\s]+$/, "");
  return fullStop && !t.endsWith("…") ? t + "." : t;
}

/* ───────────── the road itself ───────────── */

function freshRoad(flight) {
  return {
    flight, vehicles: [], updated: fmtDay(), updatedAt: new Date().toISOString(),
    categories: BOXES.map((b) => ({ ...b, status: "none", latest: "Nothing reported yet", history: [] })),
  };
}

function validateRoad(road) {
  if (!Number.isInteger(road.flight) || road.flight < 1) throw new Error("road.flight must be a number");
  if (!Array.isArray(road.categories) || road.categories.length !== BOXES.length) throw new Error("road.json must have exactly 6 boxes");
  for (const c of road.categories) {
    if (!BOXES.some((b) => b.id === c.id)) throw new Error(`unknown box ${c.id}`);
    if (!STATUSES.includes(c.status)) throw new Error(`bad status ${c.status} in ${c.id}`);
    if (c.id === "date" && c.status === "complete") throw new Error(`the Launch date box uses done (Confirmed), not complete`);
    if ((c.history || []).some((h) => h.complete !== undefined && h.complete !== true)) throw new Error(`bad complete flag in ${c.id}`);
    if ((c.history || []).filter((h) => h.kind === "check").length > 1) throw new Error(`more than one "no news yet" line in ${c.id}`);
    if (typeof c.latest !== "string" || c.latest.length > 160) throw new Error(`bad latest in ${c.id}`);
    for (const h of c.history || []) {
      if (!h.date || !h.text || !h.src || h.text.length > 200) throw new Error(`bad entry in ${c.id}: ${JSON.stringify(h)}`);
      if (h.kind !== undefined && h.kind !== "check") throw new Error(`bad kind in ${c.id}: ${JSON.stringify(h)}`);
      if (h.trust !== "trusted" && h.trust !== "unconfirmed") throw new Error(`entry without trust in ${c.id}`);
    }
  }
}

// Liftoff time of flight n as logged in app.js's FLIGHTS ({ n: 15, date: "…" }), or null.
function loggedFlightDate(appJsText, n) {
  const m = appJsText.match(new RegExp(`\\{\\s*n:\\s*${n},\\s*date:\\s*"([^"]+)"`));
  return m && Number.isFinite(new Date(m[1]).getTime()) ? m[1] : null;
}

// 09:00 Europe/London on the London day after `iso`'s London day, as an ISO string.
function nineAmLondonDayAfter(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  const guess = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1, 9); // 09:00 UTC that day
  const londonHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(new Date(guess)));
  return new Date(guess - (londonHour - 9) * 3600000).toISOString(); // BST: 09:00 London = 08:00 UTC
}

// Highest flight number already logged in app.js (check-flights.js adds it).
function lastLoggedFlight(appJsText) {
  const start = appJsText.indexOf("const FLIGHTS = [");
  const end = appJsText.indexOf("\n];", start);
  const nums = [...appJsText.slice(start, end).matchAll(/\bn:\s*(\d+)/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

// Applies Claude's updates with the trust rules. Returns the list of changes.
function applyUpdates(road, items, updates, log, limit) {
  // 1. keep only usable, new updates
  const perItem = {};
  const valid = [];
  const linesThisRun = new Set();
  const appliedKeys = new Set(road.categories.flatMap((c) => (c.history || []).map((h) => h.key).filter(Boolean)));
  for (const u of updates) {
    if (!u || !Number.isInteger(u.item) || !items[u.item - 1]) { log(`skipped malformed update ${JSON.stringify(u)}`); continue; }
    const it = items[u.item - 1];
    if (u.vehicles) {
      const vs = (Array.isArray(u.vehicles) ? u.vehicles : []).map(String).filter((x) => /^[BS]\d{1,3}$/i.test(x)).map((x) => x.toUpperCase());
      if (vs.length && isTrusted(it.tier) && !(road.vehicles || []).length) { road.vehicles = vs; log(`vehicles for Flight ${road.flight} set to ${vs.join("/")} (${it.src})`); }
      else log(`ignored vehicles ${JSON.stringify(u.vehicles)} from ${it.src} (${it.tier})`);
      continue;
    }
    const box = road.categories.find((c) => c.id === u.box);
    const line = cleanLine(u.line, { fullStop: true });
    if (!box || !line) { log(`skipped malformed update ${JSON.stringify(u)}`); continue; }
    if (appliedKeys.has(it.key)) { log(`skipped: "${it.title}" was already applied in an earlier run`); continue; }
    const dupeKey = `${box.id}|${line.toLowerCase()}`;
    if ((box.history || []).some((h) => h.text.toLowerCase() === line.toLowerCase()) || linesThisRun.has(dupeKey)) { log(`duplicate line skipped: ${line}`); continue; }
    perItem[u.item] = (perItem[u.item] || 0) + 1;
    if (perItem[u.item] > LIMITS.updatesPerItem) { log(`skipped extra fact from item ${u.item} (max ${LIMITS.updatesPerItem} per item): ${line}`); continue; }
    linesThisRun.add(dupeKey);
    valid.push({ u, it, box, line });
  }

  // 2. over the cap? keep official first, then trusted, then newest; the rest wait.
  //    An item's facts go in together or wait together (a half-applied item would
  //    later be dropped as a duplicate link and lose its other facts).
  const tierRank = { official: 0, trusted: 1 };
  const groups = new Map();
  for (const v of valid) groups.set(v.it, [...(groups.get(v.it) || []), v]);
  const keep = new Set();
  let room = Math.max(0, limit);
  [...groups.entries()]
    .sort(([a], [b]) => (tierRank[a.tier] ?? 2) - (tierRank[b.tier] ?? 2) || (b.publishedAt || "").localeCompare(a.publishedAt || ""))
    .forEach(([it, g]) => {
      if (g.length <= room || (!keep.size && room > 0)) { g.forEach((v) => keep.add(v)); room -= g.length; }
      else { it.deferred = true; log(`cap reached (${limit} changes) — "${it.title}" (${it.src}, ${g.length} fact(s)) waits for the next run`); }
    });

  // 3. apply oldest first, so the newest ends up on top of each box's history
  const changes = [];
  const toApply = valid.filter((v) => keep.has(v)).sort((a, b) => (a.it.publishedAt || "").localeCompare(b.it.publishedAt || ""));
  for (const { u, it, box, line } of toApply) {
    const trust = isTrusted(it.tier) ? "trusted" : "unconfirmed";
    const entry = { date: fmtDay(it.publishedAt), text: line, src: it.src, source: it.source, trust, url: it.url || undefined, at: it.publishedAt || new Date().toISOString(), key: it.key };
    // The source's real publish time (shown in the Updates feed). Left out when the
    // source only gives a day (SpaceX updates, FAA) or no time at all (launches page).
    if (it.publishedAt && it.timeKnown !== false) entry.publishedAt = it.publishedAt;
    const change = { box, entry, from: box.status, to: box.status, item: it, u, headline: "kept" };
    let want = STATUSES.includes(u.status) ? u.status : null;
    if (want === "complete" && box.id === "date") { log(`ignored status complete for [date] (Launch date uses done = Confirmed)`); want = null; }
    if (want === "done" && box.id !== "date") { log(`ignored status done for [${box.id}] (use complete, only when the source says the stage is finished)`); want = null; }
    if (trust === "unconfirmed") {
      log(`UNCONFIRMED [${box.id}] ${line} (${it.src}) — added with tag; status/headline left alone${want && want !== box.status ? ` (it suggested ${want})` : ""}`);
    } else {
      if (want && want !== box.status) {
        const backwards = RANK[want] < RANK[box.status];
        // a finished stage that restarts (e.g. booster back for more cryo) may be re-opened by a
        // trusted source; the Launch date's "Confirmed" still needs SpaceX/FAA to move back
        const reopen = backwards && box.id !== "date" && FINISHED(box.status);
        if (backwards && !reopen && it.tier !== "official") log(`BLOCKED [${box.id}] ${box.status} → ${want} from ${it.src}: moving a box backwards needs SpaceX/FAA`);
        else if (box.id === "date" && want === "done" && it.tier !== "official") log(`BLOCKED [date] → Confirmed from ${it.src}: only SpaceX/FAA can confirm the date`);
        else { change.to = want; box.status = want; }
      }
      // headline: keep it unless Claude says this supersedes it, the status moved, or it's still the placeholder
      const short = cleanLine(u.short, { fullStop: false });
      const replace = u.supersedes === true || change.to !== change.from || !box.latest || box.latest === "Nothing reported yet";
      if (box.status === "complete" && change.to === "complete" && change.from !== "complete") { box.latest = "Done"; change.headline = "replaced"; }
      if (want === "complete" && box.status === "complete") entry.complete = true; // the update that finished the stage (green tint in the app)
      else if (short && replace) { box.latest = short; change.headline = "replaced"; } else change.headline = "kept";
      log(`ADDED [${box.id}] ${line} (${it.src}, ${it.tier})${change.to !== change.from ? ` — status ${change.from} → ${change.to}` : ""} — headline ${change.headline}`);
    }
    const placeholder = (box.history || []).filter(isCheck);
    if (placeholder.length) log(`removed "no news yet" line from [${box.id}]: real news landed`);
    box.history = sortHistory([entry, ...(box.history || []).filter((h) => !isCheck(h))]).slice(0, LIMITS.historyPerBox);
    changes.push(change);
  }
  return changes;
}

// Newest first. Uses "at" when there is one, else the "date" text road.json uses
// ("7 Oct", "9–10 Sep", "30 Sep–2 Oct": the last day counts). Same London day:
// real news goes above a "no news yet" check line; both have "at" → by time;
// otherwise the current order is kept (stable sort).
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function londonDayKey(d) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]));
  return Number(`${p.year}${p.month}${p.day}`);
}
function historyDayKey(h, now = new Date()) {
  if (h.at && Number.isFinite(new Date(h.at).getTime())) return londonDayKey(new Date(h.at));
  const m = [...String(h.date || "").matchAll(/(\d{1,2})\s*([A-Za-z]{3})[a-z]*\.?(?:\s+(\d{4}))?/g)].pop();
  if (!m || MONTHS[m[2].toLowerCase()] === undefined) return null;
  const month = MONTHS[m[2].toLowerCase()], day = Number(m[1]);
  let year = m[3] ? Number(m[3]) : now.getUTCFullYear();
  if (!m[3] && Date.UTC(year, month, day) > now.getTime() + 7 * 86400000) year -= 1; // "28 Dec" seen in January
  return year * 10000 + (month + 1) * 100 + day;
}
function sortHistory(list, now = new Date()) {
  return list.map((h, i) => ({ h, i, k: historyDayKey(h, now) }))
    .sort((a, b) => {
      if (a.k !== b.k) return a.k === null ? 1 : b.k === null ? -1 : b.k - a.k; // undated go last
      if (isCheck(a.h) !== isCheck(b.h)) return isCheck(a.h) ? 1 : -1; // same day: real news wins
      if (a.h.at && b.h.at && a.h.at !== b.h.at) return String(b.h.at).localeCompare(String(a.h.at));
      return a.i - b.i;
    })
    .map((x) => x.h);
}

// "No news yet" lines (kind: "check") are placeholders. Per box, at most one,
// and only when nothing real has happened since the London day of the box's
// latest real entry (real news on 9 Oct → a check line from 10 Oct at the
// earliest). Finished boxes (complete / done / Confirmed) and empty boxes get
// none. A standing line keeps its wording and its date rolls to today; a new
// one uses CHECK_TEXT. Running it again on the same London day changes nothing.
// Returns one { box, action: "moved" | "added" | "removed", text, from, to } per change.
const isCheck = (h) => !!h && h.kind === "check";
function refreshCheckDates(road, now = new Date()) {
  const today = fmtDay(now.toISOString());
  const todayKey = londonDayKey(now);
  const out = [];
  for (const c of road.categories || []) {
    const hist = c.history || [];
    const checks = hist.filter(isCheck);
    const real = hist.filter((h) => !isCheck(h));
    const lastReal = real.map((h) => historyDayKey(h, now)).filter((k) => k !== null).reduce((a, b) => Math.max(a, b), 0);
    const wanted = !FINISHED(c.status) && lastReal > 0 && todayKey > lastReal;
    if (!wanted) {
      for (const h of checks) out.push({ box: c, action: "removed", text: h.text, from: h.date, to: null });
      if (checks.length) c.history = real;
      continue;
    }
    const keep = checks[0];
    if (keep && checks.length === 1 && keep.date === today) continue; // already done today
    for (const h of checks.slice(1)) out.push({ box: c, action: "removed", text: h.text, from: h.date, to: null });
    const line = keep
      ? { ...keep, date: today }
      : { date: today, text: CHECK_TEXT[c.id] || "No new reports since the last update.", src: "Tracker check", source: "manual-check", trust: "trusted", kind: "check" };
    if (!keep || keep.date !== today) out.push({ box: c, action: keep ? "moved" : "added", text: line.text, from: keep ? keep.date : null, to: today });
    c.history = sortHistory([line, ...real], now);
  }
  return out;
}

function notificationFor(road, ch) {
  const { box, entry } = ch;
  const label = (s) => (s === "done" ? box.doneText || "Done" : STATUS_TEXT[s]);
  if (ch.to !== ch.from) return { title: `${box.icon} ${box.name}: ${label(ch.to)}`, body: entry.text };
  if (entry.trust === "unconfirmed") return { title: `${box.icon} ${box.name} (unconfirmed)`, body: entry.text };
  return { title: `${box.icon} ${box.name} · Flight ${road.flight}`, body: entry.text };
}

/* ───────────── live plumbing (Firebase + git) ───────────── */

function firebaseDeps() {
  const admin = require("firebase-admin");
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  const db = admin.firestore();
  const ref = db.collection("app-state").doc("road-checker");
  return {
    async loadState() { const s = await ref.get(); return s.exists ? s.data() : null; },
    async saveState(state) { await ref.set(state); },
    // same sending code as check-flights.js
    async push(notification) {
      const subs = await db.collection("subscribers").get();
      const tokens = subs.docs.map((d) => d.id);
      if (!tokens.length) { console.log(`Would have sent "${notification.title}" — but there are no subscribers yet.`); return; }
      const resp = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: notification.title, body: notification.body } });
      console.log(`Sent "${notification.title}" to ${resp.successCount}/${tokens.length} device(s).`);
      resp.responses.forEach((r, i) => { if (!r.success) db.collection("subscribers").doc(tokens[i]).delete().catch(() => {}); });
    },
  };
}

function commitAndPush(file, message) {
  const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "pipe" });
  run(`git config user.name "Starship Tracker Bot"`);
  run(`git config user.email "actions@github.com"`);
  run(`git add ${file}`);
  run(`git commit -m ${JSON.stringify(message)}`);
  try { run("git push"); } catch { run("git pull --rebase"); run("git push"); }
}

/* ───────────── main ───────────── */

async function run(opts = {}) {
  const mode = opts.mode || (process.env.ROAD_MODE === "preview" || process.env.TEST_MODE === "true" ? "preview" : "live");
  const roadPath = opts.roadPath || path.join(ROOT, "road.json");
  const appJsPath = opts.appJsPath || path.join(ROOT, "app.js");
  const deps = opts.deps || (mode === "live" ? firebaseDeps() : { loadState: async () => null, saveState: async () => {}, push: async (n) => console.log(`(not sent) push: ${n.title} — ${n.body}`) });
  const commit = opts.commit || (mode === "live" ? commitAndPush : (f, m) => console.log(`(not committed) ${m}`));
  const sources = opts.sources || SOURCES;
  const log = (s) => console.log(`• ${s}`);
  const save = mode !== "preview";

  console.log(`=== Road checker (${mode}) ${new Date().toISOString()} ===`);
  let road = JSON.parse(fs.readFileSync(roadPath, "utf8"));
  const prevState = await deps.loadState();
  const state = prevState || { seen: [] };
  const firstRun = !prevState;
  const seen = new Set(state.seen || []);
  const notifications = [];
  let changed = false;
  const clock = opts.now || (() => Date.now());

  // 0. A push scheduled by an earlier run (the next-morning "Road to Flight N"):
  //    send it once it is due. The cleared state is saved BEFORE sending, so a
  //    crash can at worst lose it, never send it twice. Never sent in test mode.
  let scheduledSent = null;
  if (state.pendingPush) {
    const pp = state.pendingPush;
    const due = clock() >= new Date(pp.sendAfter).getTime();
    if (!save) log(`scheduled push "${pp.title}" ${due ? "is due" : `waits until ${pp.sendAfter}`} — not sent (test mode)`);
    else if (due) {
      delete state.pendingPush;
      await deps.saveState(state);
      await deps.push({ title: pp.title, body: pp.body });
      scheduledSent = pp;
      log(`sent scheduled push "${pp.title}" (due ${pp.sendAfter})`);
    } else log(`scheduled push "${pp.title}" waits until ${pp.sendAfter}`);
  }

  // 1. Has the tracked flight flown and been logged? Then start the next Road.
  const appJsText = fs.readFileSync(appJsPath, "utf8");
  const lastN = lastLoggedFlight(appJsText);
  let rolledOver = false;
  if (lastN && road.flight <= lastN) {
    log(`Flight ${road.flight} is now in the flight log — starting Road to Flight ${lastN + 1}`);
    road = freshRoad(lastN + 1);
    changed = rolledOver = true;
    // The push waits for 09:00 London the morning after the launch day.
    const launchedAt = loggedFlightDate(appJsText, lastN) || new Date(clock()).toISOString();
    state.pendingPush = {
      sendAfter: nineAmLondonDayAfter(launchedAt), flight: road.flight,
      title: `🚀 Road to Flight ${road.flight}`, body: `Flight ${lastN} is in the log. Now tracking the road to Flight ${road.flight}.`,
    };
    log(`"${state.pendingPush.title}" push scheduled for ${state.pendingPush.sendAfter} (09:00 London, morning after the launch day)`);
  }

  // 2. Collect posts from every source (one failing source never stops the run)
  let items = [];
  for (const s of sources) {
    try {
      const got = await s.fetch(road, state);
      log(`${s.name}: ${got.length} item(s)`);
      items.push(...got);
    } catch (err) {
      log(`${s.name}: unavailable (${err.message}) — skipped this run`);
    }
  }

  // posts that were waiting (cap reached, or Claude was down last time)
  items.push(...(state.pending || []));

  // 3. Drop stale, seen, duplicate and off-topic posts
  // ROAD_STALE_HOURS (preview only): look back N hours and ignore road.updatedAt, for practice runs
  const practiceHours = mode === "preview" ? Number(process.env.ROAD_STALE_HOURS) : 0;
  const cutoff = practiceHours > 0
    ? Date.now() - practiceHours * 3600000
    : Math.max(Date.now() - LIMITS.staleHours * 3600000, firstRun ? new Date(road.updatedAt || 0).getTime() : 0);
  const knownUrls = new Set(road.categories.flatMap((c) => (c.history || []).map((h) => h.url).filter(Boolean)));
  const urlsThisRun = new Set();
  const counts = { stale: 0, seen: 0, dupe: 0, offTopic: 0 };
  const candidates = [];
  const keysThisRun = new Set();
  for (const it of items) {
    if (!it.key || !it.title || keysThisRun.has(it.key)) continue;
    keysThisRun.add(it.key);
    if (seen.has(it.key)) { counts.seen++; continue; }
    if (it.publishedAt && new Date(it.publishedAt).getTime() < cutoff) { counts.stale++; seen.add(it.key); continue; }
    if (it.url && (knownUrls.has(it.url) || urlsThisRun.has(it.url))) { counts.dupe++; seen.add(it.key); continue; }
    if (!looksRelevant(`${it.title} ${it.text}`, road)) { counts.offTopic++; seen.add(it.key); continue; }
    if (it.url) urlsThisRun.add(it.url);
    candidates.push(it);
  }
  log(`filtered: ${counts.seen} already seen, ${counts.stale} stale, ${counts.dupe} duplicate, ${counts.offTopic} not about Starship → ${candidates.length} for Claude`);

  // newest first up to the cap; anything beyond waits (not marked seen)
  candidates.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  const batch = candidates.slice(0, LIMITS.itemsToClaude);
  if (candidates.length > batch.length) log(`${candidates.length - batch.length} older candidate(s) wait for the next run`);

  // 4. Claude simplifies + classifies, then the trust rules decide what changes
  let changes = [];
  if (batch.length) {
    let updates = null;
    try {
      updates = await (opts.askClaude || askClaude)(buildPrompt(road, batch), log);
      log(`Claude returned ${updates.filter((u) => !isSkip(u)).length} update(s) and ${updates.filter(isSkip).length} skip(s) for ${batch.length} item(s)`);
    } catch (err) {
      if (err.empty) {
        log(`‼️ CLAUDE EMPTY REPLY — items NOT marked seen (${batch.length} will be retried next run): ${err.message}`);
        if (process.env.GITHUB_ACTIONS) console.log(`::error::CLAUDE EMPTY REPLY — items NOT marked seen (${err.message})`);
      } else log(`Claude failed (${err.message}) — nothing changed, these posts will be retried next run`);
    }
    if (updates) {
      const accepted = updates.filter((u) => !isSkip(u));
      if (mode === "preview") console.log(`\n--- Claude raw reply ---\n${updates.raw || JSON.stringify(updates)}\n--- end raw reply ---`);
      changes = applyUpdates(road, batch, accepted, log, LIMITS.changesPerRun - notifications.length);
      for (const it of batch) if (!it.deferred) seen.add(it.key);
      const used = new Set(accepted.map((u) => u.item));
      if (mode === "preview") {
        batch.forEach((it, i) => {
          const mine = updates.filter((u) => u && u.item === i + 1);
          const why = (u) => (u && u.reason ? ` — reason: ${String(u.reason).slice(0, 160)}` : " — no reason given");
          const head = `item ${i + 1} [${it.src}, ${isTrusted(it.tier) ? "trusted" : "Unconfirmed"}] "${it.title}"`;
          const acc = mine.filter((u) => !isSkip(u));
          if (!acc.length) return log(`DECISION ${head} → skipped${why(mine[0])}`);
          for (const u of acc) {
            const box = road.categories.find((c) => c.id === u.box);
            const ch = changes.find((c) => c.u === u);
            if (u.vehicles) log(`DECISION ${head} → vehicles ${JSON.stringify(u.vehicles)}${why(u)}`);
            else if (ch) log(`DECISION ${head} → accepted: ${box.name}, status ${ch.from} → ${ch.to}${u.status && u.status !== ch.to ? ` (Claude suggested ${u.status})` : ""}, ${ch.entry.trust}, headline ${ch.headline || "kept"}: "${ch.entry.text}"${why(u)}`);
            else log(`DECISION ${head} → Claude accepted for ${box ? box.name : u.box} but not applied (duplicate, malformed or cap — see above)${why(u)}`);
          }
        });
      } else {
        batch.forEach((it, i) => { if (!used.has(i + 1)) log(`not relevant: "${it.title}" (${it.src})`); });
      }
    }
  }
  for (const ch of changes) notifications.push(notificationFor(road, ch));
  if (changes.length) changed = true;

  // 4b. Once per London day: "no news yet" lines get today's date (no push for this)
  const refreshed = refreshCheckDates(road);
  for (const m of refreshed) log(m.action === "moved" ? `DATE REFRESH [${m.box.id}] "${m.text}" ${m.from} → ${m.to} (no push)`
    : m.action === "added" ? `NO-NEWS LINE ADDED [${m.box.id}] ${m.to}: "${m.text}" (no push)`
    : `NO-NEWS LINE REMOVED [${m.box.id}] ${m.from}: "${m.text}" (no push)`);
  if (refreshed.length) changed = true;

  // 5. Save, commit, then notify (so the app already has the new card when the push lands)
  if (changed) {
    road.updated = fmtDay();
    road.updatedAt = new Date().toISOString();
    validateRoad(road);
    const json = JSON.stringify(road, null, 2) + "\n";
    if (save) {
      fs.writeFileSync(roadPath, json);
      const what = [rolledOver ? "new Road" : "", notifications.length ? `${notifications.length} update(s)` : "", refreshed.length ? `no-news lines tidied (${road.updated})` : ""].filter(Boolean).join(", ");
      commit("road.json", `Auto: Road to Flight ${road.flight} — ${what}`);
    } else console.log(`(not committed) Auto: Road to Flight ${road.flight} — ${notifications.length} update(s)${refreshed.length ? `, ${refreshed.length} no-news line change(s) (${road.updated})` : ""}`);
    if (!notifications.length && !rolledOver) log("date-only refresh — no push notification");
    for (const n of notifications) {
      if (save) await deps.push(n);
      else console.log(`(not sent) push: ${n.title} — ${n.body}`);
    }
    if (!save) console.log("\nroad.json would become:\n" + json);
  } else {
    log("no change to the Road card");
  }

  // anything not handled yet is kept, so posts from X / Launch Library (which
  // only hand each post over once) are never lost
  state.pending = candidates.filter((it) => !seen.has(it.key)).slice(0, 30)
    .map(({ key, title, text, url, publishedAt, src, source, tier }) => ({ key, title, text, url, publishedAt, src, source, tier }));
  state.seen = [...seen].slice(-LIMITS.seenKeep);
  state.lastRun = new Date().toISOString();
  if (save) await deps.saveState(state);
  return { road, changes, notifications, refreshed, state, scheduledSent };
}

module.exports = { run, parseFeed, applyUpdates, buildPrompt, trustForUrl, cleanLine, lastLoggedFlight, validateRoad, freshRoad, looksRelevant, stripBoilerplate, sortHistory, refreshCheckDates, notificationFor, nineAmLondonDayAfter, loggedFlightDate, fmtDay, CHECK_TEXT, LIMITS, SOURCES, X_ACCOUNTS };

if (require.main === module) {
  run().catch((err) => {
    console.error("Road checker failed:", err);
    process.exit(1);
  });
}
