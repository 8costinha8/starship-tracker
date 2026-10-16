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
     6. "No news yet" lines (kind: "check") are no longer made; any old
        ones are cleared out once (committed, never pushed).
     7. Entries from a trusted X post keep that post as x_post (author, text,
        created_at, its photos / video); only those media are ever shown.
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
const os = require("os");
const predict = require("./predicted.js");
const news = require("./news.js");

const ROOT = path.join(__dirname, "..");
const writer = require("./writer.js"); // WRITER=grok (default, Claude fallback) | claude

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
// Accounts read ONLY for the predicted launch date (road.json "predicted"), in the
// same single X search as above (no extra call). Their posts never reach the Road
// card, the feed or Claude's Road prompt, and never send a push.
const PREDICT_X_ACCOUNTS = {
  elonmusk: { src: "Elon Musk", tier: "trusted", id: "44196397" },
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

/* ───────────── X media (Road to Flight N page) ─────────────
   Only the photos / video attached to the trusted X post behind an entry are ever shown,
   and only if the post itself names the same vehicle or the box's topic ("matches": names
   no vehicle the entry doesn't, and names one it does or the box's subject). No YouTube
   thumbnails, og:images or news cards. */
const BOX_WORDS = {
  cryo: [/cryo/i], raptor: [/raptor/i, /engine/i], static: [/static[ -]?fire/i],
  pad: [/\bpad\b/i, /chopstick/i, /\btower\b/i, /roll ?(out|back)/i, /stack/i],
  faa: [/\bfaa\b/i, /licen[cs]e/i], date: [/launch date/i, /\bNET\b/, /\btarget/i],
};
function vehiclesIn(text) {
  const out = new Set();
  for (const m of String(text || "").matchAll(/\b(ship|booster|s|b)[\s-]?(\d{1,3})\b/gi)) {
    const kind = m[1].toLowerCase()[0] === "s" ? "S" : "B";
    if (m[1].length === 1 && m[1] !== m[1].toUpperCase()) continue; // "s 42" / "b 22" lowercase: not a vehicle
    out.add(kind + Number(m[2]));
  }
  return out;
}
function titleMatches(title, text, boxId) {
  if (!title) return false;
  const tv = vehiclesIn(title), ev = vehiclesIn(text);
  if ([...tv].some((v) => !ev.has(v))) return false; // names another vehicle: a roundup or another story
  if ([...tv].some((v) => ev.has(v))) return true;
  return (BOX_WORDS[boxId] || []).some((r) => r.test(title));
}
/* ───────────── full X post cards (Road to Flight N page) ─────────────
   Stored per entry as x_post: { post_id, url, created_at, text, author: { name, username, avatar },
   media: [{ type: "photo", url } | { type: "video", poster, video_url? }] } so the page needs no X calls.
   Videos: the highest-bitrate mp4 the API returns (played inline with controls); none → poster only. */
function xPostCard(p, mediaByKey, usersById) {
  const u = usersById[p.author_id] || {};
  const media = ((p.attachments && p.attachments.media_keys) || []).map((k) => mediaByKey[k]).filter(Boolean).map((m) => {
    const alt = m.alt_text ? { alt: decode(m.alt_text).slice(0, 300) } : {};
    if (m.type === "photo") return m.url ? { type: "photo", url: m.url, ...alt } : null;
    const mp4 = (m.variants || []).filter((v) => v.content_type === "video/mp4" && v.url).sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0));
    if (!m.preview_image_url && !mp4.length) return null;
    return { type: "video", ...(m.preview_image_url ? { poster: m.preview_image_url } : {}), ...(mp4.length ? { video_url: mp4[0].url } : {}), ...alt };
  }).filter(Boolean);
  const text = decode((p.note_tweet && p.note_tweet.text) || p.text || "").replace(/\s*https:\/\/t\.co\/\w+$/, "");
  return { post_id: p.id, url: `https://x.com/${u.username || "i"}/status/${p.id}`, created_at: p.created_at, text,
    author: { name: u.name || u.username || "", username: u.username || "", ...(u.profile_image_url ? { avatar: u.profile_image_url } : {}) }, media };
}
// One-off X backfill for older entries (flag xChecked): X post URLs already in the data in ONE
// batched tweets?ids lookup, then ONE full-archive search if the plan allows it (stop on 401/403),
// keeping total posts read under 30. Strict match, ±2 days, a post's media never reused.
// A matched entry's text is rewritten by the writer from the post (no quoted post text).
const X_FIELDS = { "tweet.fields": "created_at,author_id,attachments,note_tweet", expansions: "attachments.media_keys,author_id",
  "media.fields": "type,url,preview_image_url,variants,width,height,alt_text", "user.fields": "name,username,profile_image_url" };
const X_READ_CAP = 29;
const xIdOf = (u) => (String(u || "").match(/^(?:https?:\/\/(?:www\.)?(?:x|twitter)\.com\/[^/]+\/status\/|x:)(\d+)/i) || [])[1];
async function backfillX(road, { token, fetchFn = fetch, rewrite = null, log = console.log } = {}) {
  const res = { calls: 0, read: 0, lookup: null, archive: null, attached: [], rewritten: 0 };
  const todo = [];
  for (const c of road.categories) for (const h of c.history || []) if (!isCheck(h) && !h.xChecked && !h.x_post) todo.push({ c, h });
  if (!todo.length) return res;
  if (!token) { log("• X backfill: no X token — waits for a run that has one"); return res; }
  const auth = { authorization: `Bearer ${token}`, "user-agent": UA };
  const posts = [];
  const take = (j) => {
    const mk = Object.fromEntries(((j.includes && j.includes.media) || []).map((m) => [m.media_key, m]));
    const us = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
    const trusted = new Set(Object.values(X_ACCOUNTS).map((a) => a.id).filter(Boolean));
    for (const p of j.data || []) if (trusted.has(p.author_id) && !posts.some((q) => q.post_id === p.id)) posts.push(xPostCard(p, mk, us));
    res.read += (j.data || []).length;
  };
  // 1. X URLs already stored on entries (url or key)
  const ids = [...new Set(todo.map((t) => xIdOf(t.h.url) || xIdOf(t.h.key)).filter(Boolean))].slice(0, X_READ_CAP);
  if (ids.length) {
    const r = await fetchFn(`https://api.x.com/2/tweets?${new URLSearchParams({ ids: ids.join(","), ...X_FIELDS })}`, { headers: auth, signal: AbortSignal.timeout(20000) });
    res.calls++; const j = await r.json().catch(() => ({}));
    res.lookup = `HTTP ${r.status}, ${(j.data || []).length} post(s) for ${ids.length} id(s)`; log(`• X backfill lookup: ${res.lookup}`);
    if (r.ok) take(j);
  } else res.lookup = "no X post URLs stored on any entry — skipped (0 calls)";
  // 2. full-archive search (Pro / pay-per-use plans only); one page, under the read cap
  const room = X_READ_CAP - res.read;
  if (room >= 10) {
    const times = todo.map((t) => Date.parse(t.h.publishedAt || t.h.at || "")).filter(Number.isFinite);
    const words = [...new Set(["Starship", `"Flight ${road.flight}"`, ...vehicleWords(road).map((w) => (w.includes(" ") ? `"${w}"` : w))])];
    const query = `(${Object.keys(X_ACCOUNTS).map((h) => `from:${h}`).join(" OR ")}) (${words.join(" OR ")}) has:media -is:retweet -is:reply`;
    const start = new Date((times.length ? Math.min(...times) : Date.now() - 30 * 86400000) - 86400000).toISOString();
    const r = await fetchFn(`https://api.x.com/2/tweets/search/all?${new URLSearchParams({ query, max_results: String(Math.min(room, 25)), start_time: start, end_time: new Date(Date.now() - 60000).toISOString(), ...X_FIELDS })}`, { headers: auth, signal: AbortSignal.timeout(20000) });
    res.calls++; const j = await r.json().catch(() => ({}));
    const why = (j.title || (j.errors && j.errors[0] && (j.errors[0].title || j.errors[0].message)) || "").slice(0, 120);
    res.archive = r.ok ? `worked: HTTP ${r.status}, ${(j.data || []).length} post(s), query ${query.length} chars` : `not available: HTTP ${r.status}${why ? ` (${why})` : ""} — stopped`;
    log(`• X backfill full-archive search: ${res.archive}`);
    if (r.ok) take(j);
  }
  // 3. match: the entry's own post, else a clearly matching post within 2 days; media never reused
  const used = new Set();
  for (const { c, h } of todo) {
    const own = xIdOf(h.url) || xIdOf(h.key);
    const at = Date.parse(h.publishedAt || h.at || "");
    const ev = vehiclesIn(h.text);
    let best = own && posts.find((p) => p.post_id === own && titleMatches(p.text, h.text, c.id));
    if (!best && Number.isFinite(at)) best = posts
      .filter((p) => !used.has(p.post_id) && p.media.length && titleMatches(p.text, h.text, c.id) && [...vehiclesIn(p.text)].some((v) => ev.has(v)) && Math.abs(Date.parse(p.created_at) - at) < 2 * 86400000)
      .sort((a, b) => Math.abs(Date.parse(a.created_at) - at) - Math.abs(Date.parse(b.created_at) - at))[0];
    h.xChecked = true;
    if (!best || used.has(best.post_id)) continue;
    used.add(best.post_id);
    h.x_post = best;
    if (best.author.username) { h.src_original = h.src; h.url_original = h.url; h.src = `@${best.author.username}`; h.url = best.url; } // credit + link follow the post
    if (rewrite) {
      try { const t = await rewrite(h, [best], c); if (t) { h.text = t; res.rewritten++; } } catch (e) { log(`• X backfill rewrite failed (${e.message}) — kept the entry text`); }
    }
    res.attached.push(`${c.id} "${h.text}" ← @${best.author.username} ${best.created_at} (${best.media.length} media)`);
  }
  return res;
}
// One-off feed verification (road.feedVerified): every Road-page card must come from a real
// trusted X post. Entries are grouped into date clusters and each cluster gets ONE small
// full-archive search (max_results 10, date-bounded), total ≤ 60 posts read, stop on 401/403.
// Match = strict vehicle/topic rule + a shared vehicle (or the box topic when the entry names
// none), within 2 days, a post never reused. Matched → x_post + x_text (writer rewrite from the
// post). Unmatched → feed_hide (kept for the Starship-page Road card, which is unchanged).
const MONTHS_ = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function entryDayMs(h, year = new Date().getUTCFullYear()) {
  const t = Date.parse(h.publishedAt || h.at || "");
  if (Number.isFinite(t)) return t;
  const m = String(h.date || "").match(/(\d{1,2})(?:\s*[–-]\s*\d{1,2})?\s+([A-Za-z]{3})/);
  if (!m) return NaN;
  const mi = MONTHS_.indexOf(m[2].toLowerCase());
  return mi < 0 ? NaN : Date.UTC(year, mi, Number(m[1]), 12);
}
const FEED_READ_CAP = 60, DAY_MS = 86400000;
async function verifyFeed(road, { token, fetchFn = fetch, rewrite = null, log = console.log } = {}) {
  const res = { calls: 0, read: 0, kept: [], matched: [], dropped: [], stopped: null };
  if (road.feedVerified) return res;
  if (!token) { log("• feed check: no X token — waits for a run that has one"); return res; }
  const todo = [];
  for (const c of road.categories) for (const h of c.history || []) {
    if (isCheck(h) || c.id === "date") continue; // Launch date isn't shown on the Road page
    if (h.x_post) { if (!h.x_text) h.x_text = h.text; delete h.feed_hide; res.kept.push(`${c.id} "${h.x_text}" ← @${h.x_post.author.username}`); continue; }
    todo.push({ c, h, day: entryDayMs(h) });
  }
  const used = new Set(road.categories.flatMap((c) => (c.history || []).filter((h) => h.x_post).map((h) => h.x_post.post_id)));
  // date clusters (entries within 3 days of each other share one search)
  const dated = todo.filter((t) => Number.isFinite(t.day)).sort((a, b) => a.day - b.day);
  const clusters = [];
  for (const t of dated) { const last = clusters[clusters.length - 1]; if (last && t.day - last.max <= 3 * DAY_MS) { last.items.push(t); last.max = t.day; } else clusters.push({ min: t.day, max: t.day, items: [t] }); }
  const vwords = [...new Set([...vehicleWords(road), "S43", "B23", "S44", "B24", "Ship 43", "Booster 23"])].map((w) => (w.includes(" ") ? `"${w}"` : w));
  const query = `(${Object.keys(X_ACCOUNTS).map((h) => `from:${h}`).join(" OR ")}) (${[...vwords, `"Pad 2"`, `"Flight ${road.flight}"`, `"Flight ${road.flight + 1}"`, `"Flight ${road.flight + 2}"`].join(" OR ")}) -is:retweet -is:reply`;
  const trusted = new Set(Object.values(X_ACCOUNTS).map((a) => a.id).filter(Boolean));
  const auth = { authorization: `Bearer ${token}`, "user-agent": UA };
  // newest clusters first, so the budget goes to the most recent cards
  for (const cl of clusters.reverse()) {
    if (res.stopped || res.read + 10 > FEED_READ_CAP) { cl.items.forEach((t) => (t.unsearched = true)); continue; }
    const params = new URLSearchParams({ query, max_results: "10", start_time: new Date(cl.min - 2 * DAY_MS).toISOString(),
      end_time: new Date(Math.min(cl.max + 2 * DAY_MS, Date.now() - 60000)).toISOString(), ...X_FIELDS });
    const r = await fetchFn(`https://api.x.com/2/tweets/search/all?${params}`, { headers: auth, signal: AbortSignal.timeout(20000) });
    res.calls++;
    const j = await r.json().catch(() => ({}));
    log(`• feed check search ${new Date(cl.min - 2 * DAY_MS).toISOString().slice(0, 10)}→${new Date(cl.max + 2 * DAY_MS).toISOString().slice(0, 10)}: HTTP ${r.status}, ${(j.data || []).length} post(s)`);
    if (r.status === 401 || r.status === 403) { res.stopped = `HTTP ${r.status}`; cl.items.forEach((t) => (t.unsearched = true)); continue; }
    if (!r.ok) { cl.items.forEach((t) => (t.unsearched = true)); continue; }
    res.read += (j.data || []).length;
    const mk = Object.fromEntries(((j.includes && j.includes.media) || []).map((m) => [m.media_key, m]));
    const us = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
    const posts = (j.data || []).filter((p) => trusted.has(p.author_id)).map((p) => xPostCard(p, mk, us));
    for (const t of cl.items) {
      const ev = vehiclesIn(t.h.text);
      t.best = posts.filter((p) => !used.has(p.post_id) && Math.abs(Date.parse(p.created_at) - t.day) <= 2.5 * DAY_MS && titleMatches(p.text, t.h.text, t.c.id)
        && (ev.size ? [...vehiclesIn(p.text)].some((v) => ev.has(v)) : (BOX_WORDS[t.c.id] || []).some((re) => re.test(p.text))))
        .sort((a, b) => Math.abs(Date.parse(a.created_at) - t.day) - Math.abs(Date.parse(b.created_at) - t.day))[0];
      if (t.best) used.add(t.best.post_id);
    }
  }
  for (const t of todo) {
    const { c, h } = t;
    if (!t.best) { h.feed_hide = true; res.dropped.push(`${c.id} ${h.date} "${h.text}"${t.unsearched ? " (not searched: budget/stop)" : !Number.isFinite(t.day) ? " (no date)" : ""}`); continue; }
    h.x_post = t.best; delete h.feed_hide;
    h.x_text = h.text;
    if (rewrite) { try { const v = await rewrite(h, [t.best], c); if (v) h.x_text = v; else { delete h.x_post; delete h.x_text; h.feed_hide = true; res.dropped.push(`${c.id} ${h.date} "${h.text}" (writer: post not about the same thing)`); continue; } } catch (e) { log(`• feed check rewrite failed (${e.message}) — kept the entry text`); } }
    res.matched.push(`${c.id} ${h.date} "${h.x_text}" ← @${t.best.author.username} ${t.best.created_at} (${t.best.media.length} media)`);
  }
  if (!res.stopped) road.feedVerified = new Date().toISOString();
  return res;
}
// The writer's short, plain rewrite of an entry from its trusted X post(s). Never quotes the post.
const REWRITE_SCHEMA = { type: "object", additionalProperties: false, required: ["same", "line"], properties: { same: { type: "boolean" }, line: { type: "string" } } };
// Returns the rewritten line, or null when the writer says the post isn't about the same thing.
async function rewriteFromPosts(h, posts, c) {
  const prompt = `A Starship tracker entry and the X post(s) proposed as its source.
1. "same": true ONLY if the post(s) clearly report the same event or fact as the entry (same vehicle and same activity, e.g. both about Ship 42's cryo test). A post about a different activity of the same vehicle (e.g. engines removed vs a static fire estimate), or a general schedule post for a maintenance entry, is false.
2. "line": if same, rewrite the entry as ONE short, easy-to-read sentence (max 100 characters, British English, no hype, no quotes, no hashtags, no @handles, no links) using only facts stated in the post(s). Keep every hedge (may, could, expected, reportedly). Don't add facts. If not same, "line": "".
Stage: ${c.name || c.id}
Entry: ${h.text}
Post(s):
${posts.map((p, i) => `${i + 1}. @${p.author.username} (${p.created_at}): ${p.text}`).join("\n")}
Reply with JSON: {"same": true|false, "line": "..."}`;
  const v = await writer.askJson(prompt, { schema: REWRITE_SCHEMA, schemaName: "entry_rewrite", maxTokens: 4000, claudeMaxTokens: 400, attempts: 1,
    extract: (t) => { const o = JSON.parse(t.replace(/```json|```/g, "").trim()); if (!o || typeof o.same !== "boolean") throw new Error("no verdict"); return o; } });
  if (!v.same) return null;
  return cleanLine(v.line, { fullStop: true });
}
// PREVIEW ONLY (branch road-mix, ROAD_MIX_PREVIEW=1 in a test_mode run): relaxed matching for
// every entry without an X post. Candidates = posts already read (scripts/mix-candidates.json)
// + up to 2 small full-archive searches (≤ 25 posts read). Relaxed rule: same vehicle (or the
// box topic when the entry names none), within 3 days, Grok confirms same milestone / work /
// hardware. Logs "MIX {json}" lines; writes nothing.
async function mixPreview(road, { token, log = console.log } = {}) {
  const cands = JSON.parse(fs.readFileSync(path.join(__dirname, "mix-candidates.json"), "utf8"));
  let read = 0, calls = 0;
  const windows = [["2026-10-07T00:00:00Z", "2026-10-16T18:00:00Z"], ["2026-09-07T00:00:00Z", "2026-09-15T00:00:00Z"]];
  const vwords = [...new Set([...vehicleWords(road), "Pad 2", "Massey"])].map((w) => (w.includes(" ") ? `"${w}"` : w));
  const query = `(${Object.keys(X_ACCOUNTS).map((h) => `from:${h}`).join(" OR ")}) (${vwords.join(" OR ")}) -is:retweet -is:reply`;
  const trusted = new Set(Object.values(X_ACCOUNTS).map((a) => a.id).filter(Boolean));
  for (const [st, en] of windows) {
    if (!token || read + 10 > 25) break;
    const r = await fetch(`https://api.x.com/2/tweets/search/all?${new URLSearchParams({ query, max_results: "12", start_time: st, end_time: en, ...X_FIELDS })}`, { headers: { authorization: `Bearer ${token}`, "user-agent": UA }, signal: AbortSignal.timeout(20000) });
    calls++; const j = await r.json().catch(() => ({}));
    log(`MIX search ${st.slice(0, 10)}→${en.slice(0, 10)}: HTTP ${r.status}, ${(j.data || []).length} post(s)`);
    if (r.status === 401 || r.status === 403) break;
    read += (j.data || []).length;
    const mk = Object.fromEntries(((j.includes && j.includes.media) || []).map((m) => [m.media_key, m]));
    const us = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
    for (const p of j.data || []) if (trusted.has(p.author_id) && !cands.some((c) => c.post_id === p.id)) cands.push(xPostCard(p, mk, us));
  }
  const used = new Set(road.categories.flatMap((c) => (c.history || []).filter((h) => h.x_post).map((h) => h.x_post.post_id)));
  const results = [];
  for (const c of road.categories) for (const h of c.history || []) {
    if (isCheck(h) || c.id === "date" || h.x_post) continue;
    const day = entryDayMs(h), ev = vehiclesIn(h.text);
    const pool = cands.filter((p) => !used.has(p.post_id) && Number.isFinite(day) && Math.abs(Date.parse(p.created_at) - day) <= 3 * DAY_MS
      && (ev.size ? [...vehiclesIn(p.text)].some((v) => ev.has(v)) : (BOX_WORDS[c.id] || []).some((re) => re.test(p.text)) || /pad 2/i.test(p.text)))
      .sort((a, b) => Math.abs(Date.parse(a.created_at) - day) - Math.abs(Date.parse(b.created_at) - day)).slice(0, 2);
    let hit = null;
    for (const p of pool) {
      const prompt = `A Starship tracker entry and an X post proposed as its source.
"same": true if the post is about the same milestone, work or hardware on the same vehicle or pad, at about the same time (e.g. entry "S42 lifted by Pad 2 chopsticks" and post "Ship 42 is going up!" → true; entry "static fire estimate" and post "engines removed" → false).
"line": if same, rewrite the entry as ONE short, easy-to-read sentence (max 100 characters, British English, no hype, no quotes, hashtags, @handles or links) using only facts stated in the post. Keep hedges. If not same, "".
Stage: ${c.name || c.id}
Entry (${h.date}): ${h.text}
Post (@${p.author.username}, ${p.created_at}): ${p.text}
Reply with JSON: {"same": true|false, "line": "..."}`;
      try {
        const v = await writer.askJson(prompt, { schema: REWRITE_SCHEMA, schemaName: "entry_rewrite", maxTokens: 4000, claudeMaxTokens: 400, attempts: 1, log: () => {},
          extract: (t) => { const o = JSON.parse(t.replace(/```json|```/g, "").trim()); if (typeof o.same !== "boolean") throw new Error("no verdict"); return o; } });
        if (v.same && cleanLine(v.line, { fullStop: true })) { hit = { post: p, line: cleanLine(v.line, { fullStop: true }), writer: v.writer }; break; }
      } catch (e) { log(`MIX judge failed: ${e.message}`); }
    }
    if (hit) used.add(hit.post.post_id);
    results.push({ cat: c.id, date: h.date, text: h.text, ...(hit ? { line: hit.line, writer: hit.writer, x_post: hit.post } : { candidates: pool.length }) });
  }
  log(`MIX summary: ${calls} call(s), ${read} post(s) read, ${results.filter((r) => r.x_post).length} matched of ${results.length}`);
  for (const r of results) log(`MIX ${JSON.stringify(r)}`);
}
/* ───────────── image precision (vision check) ─────────────
   An entry only keeps an X photo / video (poster frame) that CLEARLY shows the entry's subject:
   the same vehicle (ship / booster number, or the pad) AND the same kind of event (cryo test,
   static fire, rollout, lift, engine work…). Grok vision (grok-4.3, Claude fallback) looks at
   each candidate image with the entry text, the post text and the alt text; it must say
   shows=true with confidence ≥ 0.8. Otherwise the entry is text only (still linking to its post). */
const VISION_SCHEMA = { type: "object", additionalProperties: false, required: ["shows", "confidence", "seen", "reason"],
  properties: { shows: { type: "boolean" }, confidence: { type: "number" }, seen: { type: "string" }, reason: { type: "string" } } };
const IMAGE_MIN_CONF = 0.8;
const imageOf = (m) => (m.type === "photo" ? m.url : m.poster) || null;
async function askVision(prompt, url) {
  return writer.askJson(prompt, { images: [url], schema: VISION_SCHEMA, schemaName: "image_check", maxTokens: 3000, claudeMaxTokens: 400, attempts: 1, log: () => {},
    extract: (t) => { const o = JSON.parse(t.replace(/```json|```/g, "").trim()); if (typeof o.shows !== "boolean" || typeof o.confidence !== "number") throw new Error("no verdict"); return o; } });
}
async function pickImage(entryText, boxName, post, { ask = askVision, log = console.log } = {}) {
  const media = (post && post.media) || [];
  if (!media.length) return { media: [], check: { verdict: "no media on the post" } };
  let best = null;
  const tried = [];
  for (const m of media.slice(0, 4)) {
    const url = imageOf(m);
    if (!url) continue;
    const prompt = `You check whether a picture clearly shows what a Starship tracker update is about.
Update (${boxName}): ${entryText}
X post text: ${post.text}
${m.alt ? `Alt text: ${m.alt}\n` : ""}This picture is ${m.type === "video" ? "the poster frame of the post's video" : "a photo from the post"}.
"shows": true ONLY if the picture clearly and recognisably shows the update's subject: the same vehicle (ship or booster, readable or unambiguous from context) or the same pad structure, AND the same kind of event or activity (e.g. a cryo test on the test stand, a static fire, a rollout on the transporter, a lift by the chopsticks, engine work). A generic factory interior, a dark or blurry frame, a far-off view where the subject can't be made out, a different vehicle, or an unrelated scene is false.
"confidence": 0 to 1. "seen": what is actually visible, in a few words. "reason": max 15 words.
Reply with JSON only.`;
    try {
      const v = await ask(prompt, url);
      tried.push(`${m.type} ${v.shows ? "✓" : "✗"} ${Number(v.confidence).toFixed(2)} (${v.seen})`);
      if (v.shows && v.confidence >= IMAGE_MIN_CONF && (!best || v.confidence > best.v.confidence)) best = { m, v };
    } catch (e) { tried.push(`${m.type} check failed (${String(e.message).slice(0, 80)})`); }
  }
  if (!best) return { media: [], check: { verdict: "no image clearly shows it", tried } };
  return { media: [best.m], check: { verdict: "shows it", confidence: best.v.confidence, seen: best.v.seen, reason: best.v.reason, by: best.v.writer || "grok", tried } };
}
// Keep only the verified picture on an entry's X post (the post link stays either way).
async function applyImageCheck(h, boxName, opts = {}) {
  if (!h.x_post || h.imageChecked2) return null;
  const all = h.x_post.media_all || h.x_post.media || []; // media_all: every picture the post had (a reviewed preview may have hidden some)
  const r = await pickImage(h.x_text || h.text, boxName, { ...h.x_post, media: all }, opts);
  h.x_post = { ...h.x_post, media: r.media, media_all: all };
  h.image_check = r.check; h.imageChecked2 = true;
  return r;
}
// One-off for existing entries (road.imagesVerified): vision-check every stored X picture, no X calls.
async function verifyImages(road, opts = {}) {
  const res = { checked: 0, kept: [], removed: [] };
  if (road.imagesVerified) return res;
  for (const c of road.categories) for (const h of c.history || []) {
    if (!h.x_post || h.imageChecked2) continue;
    const had = (h.x_post.media_all || h.x_post.media || []).length;
    const r = await applyImageCheck(h, c.name || c.id, opts);
    res.checked++;
    (r.media.length ? res.kept : res.removed).push(`${c.id} ${h.date}: ${had ? r.check.verdict : "no media"}${r.check.seen ? ` — ${r.check.seen}` : ""}`);
  }
  road.imagesVerified = new Date().toISOString();
  return res;
}
// One-off (road.feedJudged): re-check the feed's existing X matches with the writer, using the
// stored posts (no X calls); a post that isn't about the same thing is removed and the card hidden.
async function judgeFeed(road, { rewrite = rewriteFromPosts, log = console.log } = {}) {
  const res = { checked: 0, hidden: [], kept: [] };
  if (road.feedJudged || !road.feedVerified) return res;
  for (const c of road.categories) for (const h of c.history || []) {
    if (!h.x_post || h.feed_hide || c.id === "date") continue;
    res.checked++;
    let line;
    try { line = await rewrite(h, [h.x_post], c); } catch (e) { log(`• feed judge failed (${e.message}) — tried again next run`); return { ...res, failed: true }; }
    if (!line) { res.hidden.push(`${c.id} ${h.date} "${h.text}" ✗ @${h.x_post.author.username}: ${h.x_post.text.slice(0, 80)}`); h.feed_hide = true; delete h.x_post; delete h.x_text;
      if (h.src_original) { h.src = h.src_original; h.url = h.url_original; delete h.src_original; delete h.url_original; } }
    else { h.x_text = line; res.kept.push(`${c.id} ${h.date} "${line}" ← @${h.x_post.author.username}`); }
  }
  road.feedJudged = new Date().toISOString();
  return res;
}
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
      if (launch && (launch.net || launch.status)) state.ll2Next = { n: road.flight, status: launch.status && launch.status.abbrev, date: launch.net, precision: (launch.net_precision && launch.net_precision.abbrev) || "", at: new Date().toISOString() };
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
      for (const [h, a] of Object.entries({ ...X_ACCOUNTS, ...PREDICT_X_ACCOUNTS })) if (a.id) state.xUserIds[h] = a.id; // hard-coded ids win
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
      const words = ["Starship", "Starbase", `"Super Heavy"`, "Raptor", "Massey", `"Flight ${road.flight}"`, `"Flight ${road.flight + 1}"`, ...vehicleWords(road).map((w) => (w.includes(" ") ? `"${w}"` : w))];
      const from = Object.keys({ ...X_ACCOUNTS, ...PREDICT_X_ACCOUNTS }).filter((h) => state.xUserIds[h] && state.xUserIds[h] !== "none").map((h) => `from:${h}`);
      const query = `(${from.join(" OR ")}) (${words.join(" OR ")}) -is:retweet -is:reply`;
      const params = new URLSearchParams({ query, max_results: "25", "tweet.fields": "created_at,author_id,attachments,note_tweet",
        expansions: "attachments.media_keys,author_id", "media.fields": "type,url,preview_image_url,variants,width,height,alt_text", "user.fields": "name,username,profile_image_url" }); // media + author in the same call
      // since_id only if it is a sane post id: not in the future and inside recent search's 7-day window
      const sinceMs = state.xSinceId ? snowflakeMs(state.xSinceId) : NaN;
      const sinceOk = Number.isFinite(sinceMs) && sinceMs <= Date.now() + 60000 && Date.now() - sinceMs < 6.5 * 86400000;
      if (state.xSinceId && !sinceOk) console.log(`• X: dropping since_id ${state.xSinceId} (${Number.isFinite(sinceMs) ? new Date(sinceMs).toISOString() : "unreadable"}) — outside the 7-day window or in the future`);
      if (sinceOk) params.set("since_id", state.xSinceId);
      else params.set("start_time", new Date(Date.now() - 6 * 3600000).toISOString());
      const r = await fetch(`https://api.x.com/2/tweets/search/recent?${params}`, { ...auth, headers: { ...auth.headers, "user-agent": UA }, signal: AbortSignal.timeout(20000) });
      const body = await r.text();
      let j = {};
      try { j = JSON.parse(body); } catch {}
      const errs = [...(j.errors || []).map((e) => e.title || e.message || e.detail), j.title && `${j.title}: ${j.detail || ""}`].filter(Boolean);
      console.log(`• X search: HTTP ${r.status}, ${j.meta && j.meta.result_count != null ? j.meta.result_count : (j.data || []).length} result(s), ${sinceOk ? `since_id ${state.xSinceId} (${new Date(sinceMs).toISOString()})` : `start_time ${params.get("start_time")}`}, query ${query.length} chars, rate left ${(r.headers && r.headers.get ? r.headers.get("x-rate-limit-remaining") : null) ?? "?"}${errs.length ? `, errors: ${errs.join(" | ").slice(0, 300)}` : ""}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}${errs.length ? ` ${errs[0]}` : ""}`);
      if (j.meta && j.meta.newest_id) state.xSinceId = j.meta.newest_id;
      const mediaByKey = Object.fromEntries(((j.includes && j.includes.media) || []).map((m) => [m.media_key, m]));
      const usersById = Object.fromEntries(((j.includes && j.includes.users) || []).map((u) => [u.id, u]));
      return (j.data || []).map((p) => {
        const handle = byId[p.author_id] || "unknown";
        const xpost = xPostCard(p, mediaByKey, usersById);
        const t = X_ACCOUNTS[handle] || PREDICT_X_ACCOUNTS[handle] || { src: `@${handle}`, tier: "unconfirmed" };
        return { ...(PREDICT_X_ACCOUNTS[handle] ? { predictOnly: true } : {}), key: `x:${p.id}`, title: `@${handle} on X`, text: decode(p.text).slice(0, 600), url: `https://x.com/${handle}/status/${p.id}`, publishedAt: p.created_at, src: t.src, source: `x:${handle}`, tier: t.tier,
          xpost };
      });
    },
  },
];

// X post ids are snowflakes: the top bits are ms since 2010-11-04 (Twitter epoch).
function snowflakeMs(id) {
  try { return Number(BigInt(String(id)) >> 22n) + 1288834974657; } catch { return NaN; }
}

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

// The writer (scripts/writer.js): Grok by default, with an automatic Claude fallback
// on any Grok error / empty / invalid reply. Both get the same prompt; Grok also gets
// a strict JSON schema ({"entries": [...]}, unwrapped back to the array).
const nul = (t) => ({ type: [t, "null"] });
const entriesSchema = (props) => ({
  type: "object", additionalProperties: false, required: ["entries"],
  properties: { entries: { type: "array", items: { type: "object", additionalProperties: false, required: Object.keys(props), properties: props } } },
});
const ROAD_SCHEMA = entriesSchema({
  item: { type: "integer" }, skip: nul("boolean"), box: nul("string"), line: nul("string"), short: nul("string"),
  status: nul("string"), supersedes: nul("boolean"), reason: nul("string"), vehicles: { type: ["array", "null"], items: { type: "string" } },
});
const DATES_SCHEMA = entriesSchema({ item: { type: "integer" }, date: nul("string") });
const NEWS_SCHEMA = entriesSchema({ item: { type: "integer" }, push: { type: "boolean" }, dup: nul("string"), story: nul("string"), headline: nul("string"), reason: nul("string") });
// JSON array out of the reply; null / empty-array fields dropped (a schema reply fills every key)
function arrayReply(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned.slice(cleaned.indexOf("["), cleaned.lastIndexOf("]") + 1));
  if (!Array.isArray(parsed)) throw new Error("not a JSON array");
  return parsed.map((e) => (e && typeof e === "object" ? Object.fromEntries(Object.entries(e).filter(([, v]) => v !== null && !(Array.isArray(v) && !v.length))) : e));
}
const askWriter = (schema, name) => (prompt, log = console.log) => writer.askJson(prompt, {
  log, maxTokens: LIMITS.claudeMaxTokens, retryMs: LIMITS.claudeRetryMs, schema, schemaName: name, unwrap: "entries", extract: arrayReply,
});
const askClaude = askWriter(ROAD_SCHEMA, "road_updates"); // name kept: tests and callers inject askClaude
const askDatesWriter = askWriter(DATES_SCHEMA, "predicted_dates");
const askNewsWriter = askWriter(NEWS_SCHEMA, "news_pushes");

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
    // the full trusted X post behind the entry (Road to Flight N page), same strict match
    if (it.xpost && isTrusted(it.tier) && titleMatches(it.xpost.text, line, box.id)) {
      entry.x_post = it.xpost; entry.x_text = line;
      if (it.xpost.author.username) { entry.src = `@${it.xpost.author.username}`; entry.url = it.xpost.url; } // credit + link follow the post
    }
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

// "No news yet" lines (kind: "check") are no longer made (11 Oct 2026): the app
// shows seen / new entries instead. This now only clears out any old ones,
// once, with no push. It never adds or re-dates a line.
// Returns one { box, action: "removed", text, from, to: null } per line removed.
const isCheck = (h) => !!h && h.kind === "check";
function refreshCheckDates(road) {
  const out = [];
  for (const c of road.categories || []) {
    const hist = c.history || [];
    if (!hist.some(isCheck)) continue;
    for (const h of hist.filter(isCheck)) out.push({ box: c, action: "removed", text: h.text, from: h.date, to: null });
    c.history = hist.filter((h) => !isCheck(h));
  }
  return out;
}

const FEED_LINK = "https://8costinha8.github.io/starship-tracker/?feed=1";
function notificationFor(road, ch) {
  const n = notificationText(road, ch);
  const m = ch.entry.x_post && (ch.entry.x_post.media || [])[0];
  const img = m && imageOf(m);
  return { ...n, ...(ch.entry.x_text ? { body: ch.entry.x_text } : {}), link: FEED_LINK, ...(img ? { image: img } : {}) };
}
function notificationText(road, ch) {
  const { box, entry } = ch;
  const label = (s) => (s === "done" ? box.doneText || "Done" : STATUS_TEXT[s]);
  if (ch.to !== ch.from) return { title: `${box.icon} ${box.name}: ${label(ch.to)}`, body: entry.text };
  if (entry.trust === "unconfirmed") return { title: `${box.icon} ${box.name} (unconfirmed)`, body: entry.text };
  return { title: `${box.icon} ${box.name} · Flight ${road.flight}`, body: entry.text };
}

/* ───────────── live plumbing (Firebase + git) ───────────── */
// FCM multicast message: title/body, the Road page link, and the verified picture when there is
// one (notification.imageUrl for Android/iOS apps, webpush.notification.image for web pushes;
// iOS Safari web pushes don't show images, the text still arrives).
function fcmMessage(tokens, n) {
  const webpush = {};
  if (n.link) webpush.fcmOptions = { link: n.link };
  if (n.image) webpush.notification = { image: n.image };
  return { tokens, notification: { title: n.title, body: n.body, ...(n.image ? { imageUrl: n.image } : {}) }, ...(Object.keys(webpush).length ? { webpush } : {}) };
}

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
      const resp = await admin.messaging().sendEachForMulticast(fcmMessage(tokens, notification)); // opens the Road page; picture when verified
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

// Next flight from check-flights.js (same job, written to the runner's temp dir),
// else what the hourly Launch Library read saw. null = unknown (nothing is cleared).
function readNextFlight(handoffPath, state, road, now) {
  const file = handoffPath || path.join(process.env.RUNNER_TEMP || os.tmpdir(), "starship-next-flight.json");
  try {
    const h = JSON.parse(fs.readFileSync(file, "utf8"));
    if (h && now - new Date(h.at).getTime() < 30 * 60000) return h;
  } catch {}
  return state.ll2Next && state.ll2Next.n === road.flight ? state.ll2Next : null;
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
  console.log(`writer: ${writer.writerLabel()} (${writer.writerModel()})${writer.writerName() === "grok" ? ", Claude fallback on any Grok failure" : ""}`);
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

  // 2b. Predicted launch date: scan the posts already fetched (no extra fetches).
  //     Prediction-only X accounts (Elon) are used here and nowhere else.
  const predictItems = [...items, ...(state.predPending || [])];
  items = items.filter((it) => !it.predictOnly);
  const next = opts.next !== undefined ? opts.next : readNextFlight(opts.handoffPath, state, road, clock());
  const target = next && Number.isInteger(next.n) && next.n > 0 ? next.n : road.flight;
  const predScanned = new Set(state.predScanned || []);
  const predCutoff = clock() - LIMITS.staleHours * 3600000;
  const predBatch = [];
  for (const it of predictItems) {
    if (!it.key || predScanned.has(it.key) || seen.has(it.key) || predBatch.some((b) => b.key === it.key)) continue;
    if (!isTrusted(it.tier) || (it.publishedAt && new Date(it.publishedAt).getTime() < predCutoff)) continue;
    if (!predict.prefilter(it, target, target === road.flight ? road.vehicles || [] : [], clock())) { predScanned.add(it.key); continue; }
    predBatch.push(it);
  }
  let mentions = [];
  state.predPending = [];
  if (predBatch.length) {
    const batchP = predBatch.slice(0, 8);
    const askDates = opts.askDates || (opts.askClaude ? async () => [] : askDatesWriter); // test-road's fake Claude only knows the Road prompt
    try {
      const reply = await askDates(predict.buildDatePrompt(target, batchP), log);
      mentions = predict.mentionsFromReply(batchP, reply, target, clock());
      batchP.forEach((it) => predScanned.add(it.key));
      log(`predicted date: ${batchP.length} candidate post(s) checked, ${mentions.length} dated mention(s)${mentions.map((m) => ` [${m.source} ${m.date}]`).join("")}`);
    } catch (err) { log(`predicted date: LLM failed (${err.message}) — ${batchP.length} post(s) retried next run`); state.predPending.push(...batchP); }
    state.predPending.push(...predBatch.slice(8));
    state.predPending = state.predPending.slice(0, 20).map(({ key, title, text, url, publishedAt, src, source, tier, predictOnly }) => ({ key, title, text, url, publishedAt, src, source, tier, predictOnly }));
  }
  state.predScanned = [...predScanned].slice(-LIMITS.seenKeep);

  // 2c. News pushes: first run only seeds what's already out there (no backlog pushes)
  let newsCands = [];
  if (!state.news) {
    state.news = news.freshNewsState(clock());
    state.news.seen = predictItems.map((it) => it.key).filter(Boolean);
    log(`news: first run — ${state.news.seen.length} current item(s) seeded as seen, nothing pushed`);
  } else {
    const { candidates: nc, skipped } = news.newsCandidates([...(state.news.pending || []), ...predictItems], state.news, { isTrusted, looksStarship: (t) => looksRelevant(t, road), now: clock() });
    state.news.pending = [];
    for (const it of skipped) state.news.seen.push(it.key);
    newsCands = nc;
  }

  // 3. Drop stale, seen, duplicate and off-topic posts
  // ROAD_STALE_HOURS (preview only): look back N hours and ignore road.updatedAt, for practice runs
  const practiceHours = mode === "preview" ? Number(process.env.ROAD_STALE_HOURS) : 0;
  const cutoff = practiceHours > 0
    ? Date.now() - practiceHours * 3600000
    : Math.max(Date.now() - LIMITS.staleHours * 3600000, firstRun ? new Date(road.updatedAt || 0).getTime() : 0);
  const knownUrls = new Set(road.categories.flatMap((c) => (c.history || []).flatMap((h) => [h.url, h.url_original]).filter(Boolean)));
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
      log(`${updates.writer || "writer"} returned ${updates.filter((u) => !isSkip(u)).length} update(s) and ${updates.filter(isSkip).length} skip(s) for ${batch.length} item(s)`);
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
  // 4a-img. New entries with an X post: keep only a picture that clearly shows the update
  for (const ch of changes) {
    if (!ch.entry.x_post || (opts.sources && !opts.vision)) continue; // tests without a fake vision skip the check
    try { const r = await applyImageCheck(ch.entry, ch.box.name, { ...(opts.vision ? { ask: opts.vision } : {}), log }); if (r) log(`image [${ch.box.id}] ${r.media.length ? `kept (${r.check.seen}, ${r.check.confidence})` : `none — ${r.check.verdict}`}`); }
    catch (e) { ch.entry.x_post = { ...ch.entry.x_post, media: [] }; log(`image check failed (${e.message}) — text only`); }
  }
  if ((!opts.sources && mode === "live") || opts.verifyImages) {
    try { const vi = await verifyImages(road, { ...(opts.vision ? { ask: opts.vision } : {}), log }); if (vi.checked) { log(`image check: ${vi.checked} entries, ${vi.kept.length} kept a picture, ${vi.removed.length} text only`); [...vi.kept.map((x) => "kept: " + x), ...vi.removed.map((x) => "text only: " + x)].forEach((x) => log("  " + x)); changed = true; } }
    catch (e) { log(`image check failed: ${e.message} — tried again next run`); }
  }
  // 4a0. One-off feed verification against full-archive X search (no push)
  if ((!opts.sources && mode === "live") || opts.verifyFeed) {
    try {
      const vf = await verifyFeed(road, { token: process.env.X_BEARER_TOKEN, rewrite: rewriteFromPosts, ...(opts.verifyFeed || {}), log });
      if (vf.calls) {
        log(`feed check: ${vf.calls} call(s), ${vf.read} post(s) read${vf.stopped ? `, stopped (${vf.stopped})` : ""}; kept ${vf.kept.length}, matched ${vf.matched.length}, hidden from feed ${vf.dropped.length}`);
        [...vf.kept.map((x) => "kept: " + x), ...vf.matched.map((x) => "matched: " + x), ...vf.dropped.map((x) => "hidden: " + x)].forEach((x) => log("  " + x));
        changed = true;
      }
    } catch (e) { log(`feed check failed: ${e.message} — tried again next run`); }
  }
  if ((!opts.sources && mode === "live") || opts.judgeFeed) {
    const jf = await judgeFeed(road, { ...(opts.judgeFeed || {}), log });
    if (jf.checked && !jf.failed) { log(`feed judge: ${jf.checked} checked, ${jf.hidden.length} hidden`); [...jf.kept.map((x) => "kept: " + x), ...jf.hidden.map((x) => "hidden: " + x)].forEach((x) => log("  " + x)); changed = true; }
  }
  if (process.env.ROAD_MIX_PREVIEW === "1" && mode === "preview") await mixPreview(road, { token: process.env.X_BEARER_TOKEN, log: console.log });
  // 4a. Older entries: one-off X backfill (no push; strict match; under 30 posts read)
  for (const ch of changes) ch.entry.xChecked = true;
  if (!opts.sources || opts.backfillX) {
    try {
      const bx = await backfillX(road, { token: process.env.X_BEARER_TOKEN, rewrite: rewriteFromPosts, ...(opts.backfillX || {}), log });
      if (bx.calls || bx.lookup) {
        log(`X backfill: ${bx.calls} call(s), ${bx.read} post(s) read; lookup: ${bx.lookup}; full-archive: ${bx.archive || "not tried"}; ${bx.attached.length} entr${bx.attached.length === 1 ? "y" : "ies"} got X media (${bx.rewritten} rewritten)`);
        bx.attached.forEach((x) => log("  " + x));
        changed = true;
      }
    } catch (e) { log(`X backfill failed: ${e.message} — tried again next run`); }
  }
  for (const ch of changes) notifications.push(notificationFor(road, ch));
  if (changes.length) changed = true;

  // 4b. Clear out any old "no news yet" lines (no push for this)
  const refreshed = refreshCheckDates(road);
  for (const m of refreshed) log(m.action === "moved" ? `DATE REFRESH [${m.box.id}] "${m.text}" ${m.from} → ${m.to} (no push)`
    : m.action === "added" ? `NO-NEWS LINE ADDED [${m.box.id}] ${m.to}: "${m.text}" (no push)`
    : `NO-NEWS LINE REMOVED [${m.box.id}] ${m.from}: "${m.text}" (no push)`);
  if (refreshed.length) changed = true;

  // 4b2. News: one Claude call for this run's new trusted items (items that just made a
  //      Road change already get that push, so they're not pushed twice)
  const newsPushes = [];
  if (newsCands.length) {
    const roadKeys = new Set(changes.map((c) => c.item.key));
    const fresh = newsCands.filter((it) => { if (roadKeys.has(it.key)) { state.news.seen.push(it.key); return false; } return true; });
    const nb = fresh.slice(0, 10);
    state.news.pending = fresh.slice(10).map(({ key, title, text, url, publishedAt, src, source, tier }) => ({ key, title, text, url, publishedAt, src, source, tier }));
    const askNews = opts.askNews || (opts.askClaude || opts.sources ? null : askNewsWriter); // fake test runs: only when a test passes askNews
    if (nb.length && !askNews) nb.forEach((it) => state.news.seen.push(it.key));
    else if (nb.length) {
      const recent = state.news.sent.filter((x) => clock() - new Date(x.at).getTime() < 48 * 3600000);
      try {
        const reply = await askNews(news.buildNewsPrompt(nb, recent), log);
        nb.forEach((it) => state.news.seen.push(it.key));
        newsPushes.push(...news.decideNews(nb, reply, state.news, clock(), log));
        log(`news: ${nb.length} new item(s) checked → ${newsPushes.length} push(es) (${state.news.count}/${news.NEWS_DAILY_CAP} today)`);
      } catch (err) {
        log(`news: Claude failed (${err.message}) — ${nb.length} item(s) retried next run`);
        state.news.pending = [...nb, ...state.news.pending].slice(0, 15).map(({ key, title, text, url, publishedAt, src, source, tier }) => ({ key, title, text, url, publishedAt, src, source, tier }));
      }
    }
  }
  news.trimNews(state.news, clock());

  // 4c. Predicted launch date (no push, never bumps the Road card's "Updated")
  const before = JSON.stringify([road.predicted || null, road.predicted_candidates || []]);
  const pr = predict.computePredicted({ road, target, next, lastLogged: lastN, mentions, now: clock() });
  if (pr.predicted) road.predicted = pr.predicted; else delete road.predicted;
  if (pr.candidates.length) road.predicted_candidates = pr.candidates; else delete road.predicted_candidates;
  const predChanged = JSON.stringify([road.predicted || null, road.predicted_candidates || []]) !== before;
  if (predChanged) log(`predicted date: ${road.predicted ? `${road.predicted.mode} NET ${road.predicted.net} (${road.predicted.basis})` : "none"} — ${pr.reason} (no push)`);

  // 5. Save, commit, then notify (so the app already has the new card when the push lands)
  if (changed || predChanged) {
    if (changed) {
      road.updated = fmtDay();
      road.updatedAt = new Date().toISOString();
    }
    validateRoad(road);
    predict.validatePredicted(road);
    const json = JSON.stringify(road, null, 2) + "\n";
    if (save) {
      fs.writeFileSync(roadPath, json);
      const what = [rolledOver ? "new Road" : "", notifications.length ? `${notifications.length} update(s)` : "", refreshed.length ? `no-news lines tidied (${road.updated})` : "", predChanged ? `predicted date ${road.predicted ? `NET ${road.predicted.net}` : "cleared"}` : ""].filter(Boolean).join(", ");
      commit("road.json", `Auto: Road to Flight ${road.flight} — ${what}`);
    } else console.log(`(not committed) Auto: Road to Flight ${road.flight} — ${notifications.length} update(s)${refreshed.length ? `, ${refreshed.length} no-news line change(s) (${road.updated})` : ""}`);
    if (!notifications.length && !rolledOver) log("no push notification for this change");
    for (const n of notifications) {
      if (save) await deps.push(n);
      else console.log(`(not sent) push: ${n.title} — ${n.body}`);
    }
    if (!save) console.log("\nroad.json would become:\n" + json);
  } else {
    log("no change to the Road card");
  }

  // 5b. News pushes (no commit needed: nothing in road.json changes). In test mode: logged only.
  for (const n of newsPushes) {
    if (save) await deps.push(n);
    else console.log(`(not sent) news push: ${n.title} — ${n.body}`);
  }

  // anything not handled yet is kept, so posts from X / Launch Library (which
  // only hand each post over once) are never lost
  state.pending = candidates.filter((it) => !seen.has(it.key)).slice(0, 30)
    .map(({ key, title, text, url, publishedAt, src, source, tier }) => ({ key, title, text, url, publishedAt, src, source, tier }));
  state.seen = [...seen].slice(-LIMITS.seenKeep);
  state.lastRun = new Date().toISOString();
  if (save) await deps.saveState(state);
  return { road, changes, notifications, refreshed, state, scheduledSent, newsPushes };
}

module.exports = { pickImage, applyImageCheck, verifyImages, fcmMessage, notificationFor, judgeFeed, verifyFeed, entryDayMs, backfillX, xPostCard, xIdOf, readNextFlight, PREDICT_X_ACCOUNTS, run, parseFeed, applyUpdates, buildPrompt, trustForUrl, cleanLine, lastLoggedFlight, validateRoad, freshRoad, looksRelevant, stripBoilerplate, sortHistory, refreshCheckDates, notificationFor, nineAmLondonDayAfter, titleMatches, vehiclesIn, loggedFlightDate, fmtDay, CHECK_TEXT, LIMITS, SOURCES, X_ACCOUNTS };

if (require.main === module) {
  run().catch((err) => {
    console.error("Road checker failed:", err);
    process.exit(1);
  });
}
