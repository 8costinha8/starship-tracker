/* X-first Road pipeline.
   Each run: read NEW posts (since_id) from the trusted accounts in ONE X search call, classify
   them all in ONE batched writer call (Grok, Claude fallback) as road (with a stage), news or skip,
   and turn every road post into a Road card of its own: the post's own photo (or a video's
   preview image), its link, @author credit and a short writer text. Posts within 48h about the
   same hardware merge into one card; the best media wins (video over photo). Articles never
   create Road cards. */
const crypto = require("crypto");

const XF_ACCOUNTS = ["SpaceX", "elonmusk", "NASASpaceflight", "LabPadre", "RGVaerialphotos", "StarbaseSurfer", "CSI_Starbase", "nicans", "ZackGolden_", "Starship_Spring", "FAANews"];
const OFFICIAL = new Set(["spacex", "faanews"]);
const STARSHIP_WORDS = /starship|super ?heavy|booster|\bship ?\d|\b[bs]\d{2}\b|raptor|starbase|massey|chopsticks|mechazilla|static fire|flight \d+|olp|launch pad|faa/i;
const MERGE_MS = 48 * 3600000;
const XF_FIELDS = { "tweet.fields": "created_at,author_id,attachments,note_tweet,referenced_tweets,entities", expansions: "attachments.media_keys,author_id",
  "media.fields": "type,url,preview_image_url,variants,width,height,alt_text", "user.fields": "name,username,profile_image_url" };
const MAX_POSTS = 40;

function xfQuery() { return `(${XF_ACCOUNTS.map((a) => `from:${a}`).join(" OR ")}) -is:retweet -is:reply`; }

// One search/recent call. First run (no since_id): only learns the newest id, makes no cards.
async function fetchNewPosts({ token, sinceId, fetchFn = fetch, postCard }) {
  if (!token) return { posts: [], sinceId, calls: 0, why: "no X token" };
  const u = new URL("https://api.x.com/2/tweets/search/recent");
  u.searchParams.set("query", xfQuery());
  u.searchParams.set("max_results", sinceId ? String(MAX_POSTS) : "10");
  if (sinceId) u.searchParams.set("since_id", sinceId);
  for (const [k, v] of Object.entries(XF_FIELDS)) u.searchParams.set(k, v);
  const res = await fetchFn(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`X search HTTP ${res.status}`);
  const j = await res.json();
  const data = j.data || [], inc = j.includes || {};
  const mediaByKey = Object.fromEntries((inc.media || []).map((m) => [m.media_key, m]));
  const usersById = Object.fromEntries((inc.users || []).map((x) => [x.id, x]));
  const newest = (j.meta && j.meta.newest_id) || data.reduce((a, p) => (!a || BigInt(p.id) > BigInt(a) ? p.id : a), sinceId);
  if (!sinceId) return { posts: [], sinceId: newest, calls: 1, read: data.length, why: "first run — newest id remembered, no cards" };
  const posts = data.map((p) => postCard(p, mediaByKey, usersById))
    .filter((p) => p.author.username.toLowerCase() !== "elonmusk" || STARSHIP_WORDS.test(p.text)); // Elon: Starship posts only
  return { posts, sinceId: newest || sinceId, calls: 1, read: data.length };
}

const CLASSIFY_SCHEMA = { type: "object", additionalProperties: false, required: ["entries"], properties: { entries: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["item", "kind", "stage", "hardware", "text", "status", "event", "reason"],
  properties: { item: { type: "integer" }, kind: { type: "string", enum: ["road", "news", "skip"] }, stage: { type: ["string", "null"] },
    hardware: { type: ["string", "null"] }, text: { type: ["string", "null"] }, status: { type: ["string", "null"], enum: ["progress", "done", "confirmed", null] }, event: { type: ["string", "null"], enum: ["cryo_test", "static_fire", "engines_installed", "stacked", "wdr", "licence", null] }, reason: { type: "string" } } } } } };

function classifyPrompt(road, posts, stages) {
  return `You sort new X posts for a Starship tracker's "Road to Flight ${road.flight}" page.
Vehicles for this flight: ${(road.vehicles || []).join(", ") || "unknown"}.
For EVERY post return one entry: {item, kind, stage, hardware, text, status, event, reason}.
kind:
- "road": concrete, real progress toward Flight ${road.flight}: hardware moving or being worked on, a test (cryo, static fire, engine install/removal, stacking, pad work), or regulatory progress (FAA licence). It must be real (photo/video/report of actual events).
  ALSO "road": a firm statement or trusted report about Flight ${road.flight}'s OWN vehicles or mission, even without a photo, e.g. SpaceX/Musk confirming it will try to catch the booster and/or the ship, a vehicle reported to have all engines installed, a rollout or static fire reported as imminent. Read the post's [link: ...] title/description too: a teaser post linking an article counts for what the article reports about Flight ${road.flight}.
- "news": real Starship news that is not a Road step for Flight ${road.flight} (e.g. long-term cadence plans, other flights, policy). If a post mixes long-term plans with a concrete Flight ${road.flight} item, it is "road" for that item.
- "skip": anything else — memes, opinions, jokes, renders/artwork, polls, merch, livestream ads, vague hype, unrelated topics.
stage (road only): one of ${stages.map((s) => `"${s.id}" (${s.name})`).join(", ")}; null otherwise.
hardware (road only): the main hardware id in short form, e.g. "S42", "B22", "Pad 2", "FAA"; null if none.
status (road only, else null): "progress" if the post shows the stage is now under way (or restarted), "done" ONLY if it clearly says the stage is finished (e.g. static fire completed, licence issued), "confirmed" ONLY for an official launch date confirmation (Launch date stage); null if the post doesn't change the stage's status.
event (road only, else null): the concrete milestone the post shows actually HAPPENING: "cryo_test" (a cryo/proof test was done), "static_fire" (a static fire was done), "engines_installed" (Raptors fully installed), "stacked" (ship stacked on booster), "wdr" (wet dress rehearsal), "licence" (FAA launch licence issued); null for anything else (rollouts, plans, forecasts, removals).
text (road only): ONE short plain sentence (max 20 words) saying what happened, no hashtags, no emojis, no @handles; null otherwise.
Posts:
${posts.map((p, i) => `${i + 1}. @${p.author.username} ${p.created_at} [${p.media.length ? p.media.map((m) => m.type).join("+") : "no media"}]: ${p.text.replace(/\s+/g, " ").slice(0, 600)}${p.link && (p.link.title || p.link.description || p.link.lead) ? ` [link: ${[p.link.title, p.link.lead || p.link.description].filter(Boolean).join(" — ").replace(/\s+/g, " ").slice(0, 1000)}]` : ""}`).join("\n")}`;
}

async function classifyPosts(road, posts, stages, ask) {
  if (!posts.length) return [];
  const reply = await ask(classifyPrompt(road, posts, stages), { schema: CLASSIFY_SCHEMA, schemaName: "classify", unwrap: "entries", maxTokens: 8000 });
  const list = Array.isArray(reply) ? reply : (reply && reply.entries) || [];
  return posts.map((p, i) => {
    const r = list.find((x) => x && x.item === i + 1);
    if (!r || !["road", "news", "skip"].includes(r.kind)) return { kind: "skip", reason: "no verdict" };
    if (r.kind === "road" && (!stages.some((s) => s.id === r.stage) || !r.text)) return { kind: "skip", reason: "road without a valid stage/text" };
    return r;
  });
}

// Teaser posts that link a trusted outlet's article: read the article's opening paragraphs (plain
// HTTP GET, no API cost; at most 3 per run) so the classifier sees what the article reports.
const LINK_HOSTS = /(^|\.)(nasaspaceflight\.com|spacex\.com|faa\.gov)$/i;
const MAX_LINK_READS = 3;
function articleLead(html) {
  const body = String(html).replace(/<(script|style|figure|blockquote)[^]*?<\/\1>/gi, " ");
  const ps = [...body.matchAll(/<p[^>]*>([^]*?)<\/p>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").replace(/&#8217;|&rsquo;/g, "’").replace(/&#8220;|&#8221;|&quot;/g, '"').replace(/&amp;/g, "&").replace(/&nbsp;|\s+/g, " ").trim()).filter((t) => t.length > 60);
  return ps.join(" ").slice(0, 900);
}
async function readLinks(posts, fetchFn, log = () => {}) {
  let n = 0;
  for (const p of posts) {
    const u = p.link && p.link.url; let host = ""; try { host = new URL(u).hostname; } catch { continue; }
    if (!LINK_HOSTS.test(host) || p.link.lead || n >= MAX_LINK_READS) continue;
    n++;
    try { const r = await fetchFn(u, { headers: { "User-Agent": "Mozilla/5.0 starship-tracker" }, signal: AbortSignal.timeout(10000) }); if (r.ok) p.link.lead = articleLead(await r.text()); }
    catch (e) { log(`X-first: link not read (${host}: ${e.message})`); }
  }
  return n;
}
// The post's own media; a link-only post (no photo/video) uses its link card's image, as X shows it.
function postMedia(post) { return bestMedia(post.media) || (post.link && post.link.image ? { type: "photo", url: post.link.image } : null); }
function bestMedia(media) {
  const v = media.find((m) => m.type === "video" && m.poster);
  return v || media.find((m) => m.type === "photo" && m.url) || null;
}
const mediaRank = (m) => (!m ? 0 : m.type === "video" ? 2 : 1);
const hwKey = (s) => String(s || "").toUpperCase().replace(/^SHIP\s*/, "S").replace(/^BOOSTER\s*/, "B").replace(/\s+/g, "");

function overrideFor(post, m) {
  return { post_url: post.url, post_id: post.post_id, author: post.author.username, type: m.type === "video" ? "video" : "photo", image: m.type === "video" ? m.poster : m.url };
}

function dayLabel(iso) { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" }); }

// Build a new card or merge into a recent card about the same hardware. Returns {box, entry, merged}.
function placePost(road, post, cls, now = Date.now()) {
  const box = road.categories.find((c) => c.id === cls.stage);
  const m = postMedia(post);
  const at = Date.parse(post.created_at) || now;
  const key = hwKey(cls.hardware);
  const prev = key && road.categories.flatMap((c) => (c.history || []).map((h) => ({ c, h })))
    .find(({ h }) => h.x_first && hwKey(h.hardware) === key && Math.abs(at - Date.parse(h.at)) <= MERGE_MS);
  if (prev) {
    const h = prev.h;
    h.x_posts = [...new Set([...(h.x_posts || []), post.post_id])];
    const cur = h.media_override ? { type: h.media_override.type } : null;
    if (m && mediaRank(m) > mediaRank(cur)) { h.media_override = overrideFor(post, m); h.x_post = post; h.url = post.url; }
    return { box: prev.c, entry: h, merged: true };
  }
  const official = OFFICIAL.has(post.author.username.toLowerCase());
  const entry = { id: "x-" + post.post_id, date: dayLabel(post.created_at), at: new Date(at).toISOString(), text: cls.text, x_text: cls.text,
    url: post.url, src: `@${post.author.username}`, trust: "trusted", ...(official ? { official: true } : {}), x_first: true, stage: cls.stage,
    hardware: cls.hardware || null, ...(Number.isInteger(cls.flight) ? { flight: cls.flight } : {}) /* optional flight tag (not asked for yet: untagged = the app's default) */, x_post: post, x_posts: [post.post_id], xChecked: true, imageChecked2: true,
    ...(m ? { media_override: overrideFor(post, m) } : {}) };
  box.history = [entry, ...(box.history || [])].slice(0, 12);
  box.latest = cls.text.slice(0, 160);
  return { box, entry, merged: false };
}

// The whole step. ask(prompt, opts) → JSON (writer.askJson). Returns cards, news items, state.
async function runXFirst(road, state, { token, fetchFn, ask, postCard, log = console.log, now = Date.now(), maxCards = 5, status = null, milestone = null, linkFetch = null }) {
  const xs = state.xFirst || {};
  const got = await fetchNewPosts({ token, sinceId: xs.sinceId, fetchFn, postCard });
  const seen = new Set(xs.seen || []);
  const posts = [...(xs.pending || []), ...got.posts].filter((p, i, a) => !seen.has(p.post_id) && a.findIndex((q) => q.post_id === p.post_id) === i).slice(0, MAX_POSTS);
  const waiting = [];
  log(`X-first: ${got.calls} X call(s), ${got.read || 0} read, ${posts.length} new post(s)${got.why ? ` — ${got.why}` : ""}`);
  const stages = road.categories.map((c) => ({ id: c.id, name: c.name }));
  let verdicts = [];
  if (posts.length && linkFetch) await readLinks(posts, linkFetch, log);
  if (posts.length) {
    try { verdicts = await classifyPosts(road, posts, stages, ask); }
    catch (e) { log(`X-first: writer failed (${e.message}) — posts retried next run`); return { cards: [], merged: [], news: [], state: { ...xs }, calls: got.calls, retry: true }; /* since_id not advanced */ }
  }
  const cards = [], merged = [], newsItems = [];
  posts.forEach((p, i) => {
    const v = verdicts[i];
    seen.add(p.post_id);
    if (v.reason === "no verdict" && !p.retry) { seen.delete(p.post_id); waiting.push({ ...p, retry: 1 }); return log(`X-first: no verdict for @${p.author.username} ${p.post_id} — retried next run`); } // the writer skipped it: one more try
    if (v.kind === "news") newsItems.push({ key: `x:${p.post_id}`, title: p.text.slice(0, 200), text: p.text, url: p.url, publishedAt: p.created_at, src: `X @${p.author.username}`, source: `@${p.author.username}`, tier: OFFICIAL.has(p.author.username.toLowerCase()) ? "official" : "trusted" });
    if (v.kind !== "road") return log(`X-first: ${v.kind} @${p.author.username} ${p.post_id} — ${v.reason || ""}`);
    if (cards.length >= maxCards) { seen.delete(p.post_id); waiting.push(p); return log(`X-first: card cap reached — @${p.author.username} ${p.post_id} waits`); }
    const r = placePost(road, p, v, now);
    if (status && v.status) r.st = status(r.box, v.status, p, r.entry);
    if (milestone && v.event) milestone(v, p); // running per-vehicle summary (counts + dates)
    (r.merged ? merged : cards).push(r);
    log(`X-first: road/${v.stage} ${v.hardware || "-"} @${p.author.username} ${p.post_id} → ${r.merged ? `merged into ${r.entry.id}` : `new card ${r.entry.id}`}`);
  });
  return { cards, merged, news: newsItems, state: { sinceId: got.sinceId, seen: [...seen].slice(-500), pending: waiting.slice(0, 20) }, calls: got.calls };
}

module.exports = { runXFirst, fetchNewPosts, classifyPosts, classifyPrompt, placePost, bestMedia, postMedia, articleLead, readLinks, hwKey, xfQuery, XF_ACCOUNTS, CLASSIFY_SCHEMA, MERGE_MS };
