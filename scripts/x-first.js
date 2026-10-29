/* X-first Road pipeline.
   Each run: read NEW posts (since_id) from the trusted accounts in ONE X search call, classify
   them all in ONE batched writer call (xAI Grok) as road (with a stage), news or skip,
   and turn every road post into a Road card of its own: the post's own photo (or a video's
   preview image), its link, @author credit and a short writer text. Posts within 48h about the
   same hardware merge into one card; the best media wins (video over photo). Articles never
   create Road cards. */
const logText_ = require("./log-text.js");
const crypto = require("crypto");

const XF_ACCOUNTS = ["SpaceX", "elonmusk", "NASASpaceflight", "LabPadre", "RGVaerialphotos", "StarbaseSurfer", "CSI_Starbase", "nicans", "ZackGolden_", "Starship_Spring", "FAANews", "efraser77", "TrackingTheSB", "Blobifie", "StarshipGazer"];
const OFFICIAL = new Set(["spacex", "faanews"]);
const tiers = require("./source-tiers.js"); // Tier 1 confirmed / Tier 2 reported / Tier 3 rumour
const STARSHIP_WORDS = /starship|super ?heavy|booster|\bship ?\d|\b[bs]\d{2}\b|raptor|starbase|massey|chopsticks|mechazilla|static fire|flight \d+|olp|launch pad|faa/i;
const MERGE_MS = 48 * 3600000;
const XF_FIELDS = { "tweet.fields": "created_at,author_id,attachments,note_tweet,referenced_tweets,entities", expansions: "attachments.media_keys,author_id",
  "media.fields": "type,url,preview_image_url,variants,width,height,alt_text", "user.fields": "name,username,profile_image_url" };
const MAX_POSTS = 40;

function xfQuery() { return `(${[...XF_ACCOUNTS, ...tiers.extraAccounts()].map((a) => `from:${a}`).join(" OR ")}) -is:retweet -is:reply`; }

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

// Pre-flight milestone types: one Road entry per (type + flight + vehicle), Expected → In progress → Completed.
const MILESTONE_TYPES = ["cryo_test", "proof_test", "static_fire", "engines_installed", "stacked", "rollout", "wdr", "pad_work", "licence", "launch_date"];
const PHASES = ["expected", "progress", "completed"];
const MISSION_TOPICS = ["net", "catch", "objectives", "payload", "trajectory", "landing", "licence", "other"];
const CLASSIFY_SCHEMA = { type: "object", additionalProperties: false, required: ["entries"], properties: { entries: { type: "array", items: {
  type: "object", additionalProperties: false, required: ["item", "kind", "stage", "hardware", "text", "log_text", "status_line", "status", "event", "phase", "flight", "media_fit", "speculative", "inferred", "topic", "attribution", "confidence", "reason"],
  properties: { item: { type: "integer" }, kind: { type: "string", enum: ["road", "mission-update", "starship-news", "skip"] }, stage: { type: ["string", "null"] }, confidence: { type: ["number", "null"] },
    hardware: { type: ["string", "null"] }, text: { type: ["string", "null"] }, log_text: { type: ["string", "null"] }, status_line: { type: ["string", "null"] }, status: { type: ["string", "null"], enum: ["progress", "done", "confirmed", null] }, event: { type: ["string", "null"], enum: [...MILESTONE_TYPES, null] }, phase: { type: ["string", "null"], enum: ["expected", "progress", "completed", null] }, flight: { type: ["integer", "null"] }, media_fit: { type: ["string", "null"], enum: ["shows-event", "unrelated", "none", null] }, speculative: { type: ["boolean", "null"] }, inferred: { type: ["boolean", "null"] }, topic: { type: ["string", "null"], enum: [...MISSION_TOPICS, null] }, attribution: { type: ["string", "null"] }, reason: { type: "string" } } } } } };

function classifyPrompt(road, posts, stages) {
  return `You sort new X posts for a Starship tracker's "Road to Flight ${road.flight}" page.
Vehicles for this flight: ${(road.vehicles || []).join(", ") || "unknown"}.
For EVERY post return one entry: {item, kind, stage, hardware, text, log_text, status, event, phase, flight, media_fit, speculative, inferred, topic, attribution, reason}.
kind:
- "road": ONLY hardware and test progress toward Flight ${road.flight}: rollouts, cryo tests, static fires, engine installs/removals, stacking, pad work. It must be real (photo/video/report of actual events, incl. a trusted report such as "all engines installed" or a rollout due).
- "mission-update": anything about Flight ${road.flight}'s MISSION itself: launch date/NET, catch plans (booster and/or ship), flight objectives, payload, trajectory, landing/catch targets, licence-driven mission changes. Never a Road card. STARSHIP ONLY: a Falcon 9, Starlink, Dragon/Crew/CRS, Transporter or other non-Starship mission post (e.g. "Payload deployment sequence is complete", "Deployment of 24 Starlink satellites confirmed") is NEVER a mission-update (skip it); a post with no Starship/Flight ${road.flight} context is skip.
- "starship-news": real Starship news that is neither (long-term cadence plans, other flights, policy, the wider programme).
- "skip": anything else — memes, opinions, jokes, renders/artwork, polls, merch, livestream ads, vague hype, unrelated topics.
Read the post's [link: ...] title/description too: a teaser post linking an article counts for what the article reports about Flight ${road.flight}. If a post mixes long-term plans with a concrete Flight ${road.flight} item, classify it by that item.
stage (road only): one of ${stages.map((s) => `"${s.id}" (${s.name})`).join(", ")}; null otherwise.
${require("./purpose.js").promptRules(road)}
hardware (road only): the main hardware id in short form, e.g. "S42", "B22", "Pad 2", "FAA"; null if none.
status (road only, else null): "progress" if the post shows the stage is now under way (or restarted), "done" ONLY if it clearly says the stage is finished (e.g. static fire completed, licence issued), "confirmed" ONLY for an official launch date confirmation (Launch date stage); null if the post doesn't change the stage's status.
event (road only, else null): the concrete milestone the post shows actually HAPPENING: "cryo_test" (a cryo/proof test was done), "static_fire" (a static fire was done), "engines_installed" (Raptors fully installed), "stacked" (ship stacked on booster), "wdr" (wet dress rehearsal), "licence" (FAA launch licence issued); null for anything else (rollouts, plans, forecasts, removals).
milestone (road only): event above is also the milestone TYPE the post is about, even when it hasn't happened yet: ${MILESTONE_TYPES.map((t) => `"${t}"`).join(", ")}; null if none fits.
phase (road only, else null): "expected" (announced / about to happen, e.g. "B22 about to roll to Pad 2 for static fire"), "progress" (under way now), "completed" ONLY if the post clearly shows or says it happened / finished.
flight (road only, else null): the flight number this hardware is for if the post or vehicle list says so, else null.
media_fit (road only, else null): "shows-event" if the post's own photo/video shows THIS milestone's hardware/place doing what the text says; "unrelated" if the media shows something else (a launch shot for a ground test, a render, a different vehicle); "none" if the post has no media.
speculative (road only, else null): true if the post's claim about THIS milestone is rumour, hope or speculation ("could", "hearing", "reportedly", "hopefully", a question), else false.
inferred (road only, else null): true if the post does not say the step happened and you are inferring it (e.g. "headed back to the production site" → "cryo done"), else false.
Accuracy: vehicle numbers, pad names and the phase must be exactly what the post says; never infer a number that isn't in the post.
text (road / mission-update, else null): ONE short plain sentence (max 20 words), no hashtags, no emojis, no @handles. Road: what happened. Mission-update: the mission fact, e.g. "SpaceX plans to try catching both Booster 22 and Ship 42".
topic (mission-update only, else null): one of ${MISSION_TOPICS.map((t) => `"${t}"`).join(", ")}.
log_text (road only, else null): the Flight Log line. ONE short plain sentence (max 15 words), vehicle + action + place, full names ("Ship 42", "Booster 22", "Pad 2"), ending with a full stop, e.g. "Ship 42 completed its cryo tests at Massey's.", "Booster 22 heads to Pad 2 for a potential static fire test.". A finished step says "completed" or "completes" (never finished/wrapped up). Write "its", never "it's"; no doubled words; never "is been"; never "Ship 42's completes"; no filler such as "has been transported" (say "heads back to" / "rolled to"). No times, dates, handles, links, source or outlet names. Keep hedges (could, reportedly). Satellites are "deployed".
status_line (road only, else null): the section's overview status line: short and direct, about 6 words (max 8), one line, the plain current state, ending with a full stop, same rules for ships and boosters, e.g. "No Flight 15 licence yet.", "Booster 22 static fire done.", "Ship 42 Raptors installed.", "Ship 42 heading to Massey's.", "Flight 15 NET 8 November.". No hedging filler, no reasons, no source or outlet names, no handles, links or times. Keep a real hedge in one word if needed ("Ship 43 cryo test possible.").
attribution (mission-update only, else null): who said it, 2-3 words, e.g. "Musk confirmed", "SpaceX", "FAA", "NSF reports". The text NEVER repeats the person or org named in the attribution: no "Elon Musk says …" when the credit is Elon Musk; write the fact itself, e.g. text "SpaceX is attempting a double catch on Flight 15", attribution "Elon Musk".
Posts:
${posts.map((p, i) => `${i + 1}. @${p.author.username} ${p.created_at} [${p.media.length ? p.media.map((m) => m.type).join("+") : "no media"}]: ${p.text.replace(/\s+/g, " ").slice(0, 600)}${p.link && (p.link.title || p.link.description || p.link.lead) ? ` [link: ${[p.link.title, p.link.lead || p.link.description].filter(Boolean).join(" — ").replace(/\s+/g, " ").slice(0, 1000)}]` : ""}`).join("\n")}`;
}

async function classifyPosts(road, posts, stages, ask) {
  if (!posts.length) return [];
  const reply = await ask(classifyPrompt(road, posts, stages), { schema: CLASSIFY_SCHEMA, schemaName: "classify", unwrap: "entries", maxTokens: 8000 });
  const list = Array.isArray(reply) ? reply : (reply && reply.entries) || [];
  return posts.map((p, i) => {
    const r = list.find((x) => x && x.item === i + 1);
    if (r && r.kind === "news") r.kind = "starship-news"; // older wording
    if (!r || !["road", "mission-update", "starship-news", "skip"].includes(r.kind)) return { kind: "skip", reason: "no verdict" };
    if (r.kind === "mission-update" && (!MISSION_TOPICS.includes(r.topic) || !r.text)) return { kind: "skip", reason: "mission-update without a topic/text" };
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

// media upgrade watch (media-watch.js): an upgraded or keep_image picture is never replaced by a later merge (no downgrade)
const lockedMedia = (h) => !!(h.media_locked || (h.media_override && (h.media_override.auto || h.media_override.keep_image)));
function overrideFor(post, m) {
  return { post_url: post.url, post_id: post.post_id, author: post.author.username, type: m.type === "video" ? "video" : "photo", image: m.type === "video" ? m.poster : m.url, ...(m.type === "video" && m.video_url ? { video_url: m.video_url } : {}) };
}

function dayLabel(iso) { return require("./push-sync.js").ukDay(iso); } // "13 Sep" (never "Sept")

// Build a new card or merge into a recent card about the same hardware. Returns {box, entry, merged}.
// Facts in the line must be in the post: every vehicle / pad number in text+hardware appears in the post (or its link card).
const IDS = /\b(?:(ship|booster|pad|olp|s|b)[\s-]?(\d{1,3}))\b/gi;
const normIds = (t) => [...String(t || "").matchAll(IDS)].map((m) => ({ s: "S", ship: "S", b: "B", booster: "B", pad: "P", olp: "P" })[m[1].toLowerCase()] + Number(m[2]));
function factsMatch(cls, post) {
  const src = new Set(normIds(`${post.text} ${post.link ? `${post.link.title || ""} ${post.link.description || ""} ${post.link.lead || ""}` : ""}`));
  return normIds(`${cls.text || ""} ${cls.hardware || ""}`).every((id) => src.has(id));
}
const phaseOf = (cls) => (PHASES.includes(cls.phase) ? cls.phase : cls.status === "done" || cls.status === "confirmed" ? "completed" : cls.status === "progress" ? "progress" : cls.event ? "completed" : "progress");
const milestoneKey = (type, flight, hw) => `${type}|${flight}|${hwKey(hw) || "-"}`;
// Context picture for an entry that hasn't happened yet: an earlier trusted post's (or road-media.json pick's)
// picture of the SAME hardware in the SAME stage — never a generic or a different-event shot. None → no picture.
function contextImage(road, stage, hardware, exceptId, picks = []) {
  const key = hwKey(hardware);
  if (!key || stage === "date") return null;
  const cands = [];
  for (const c of road.categories) if (c.id === stage) for (const h of c.history || []) {
    if (h.id === exceptId || hwKey(h.hardware) !== key || h.trust !== "trusted" || h.media_context) continue;
    const mo = h.media_override, ph = h.x_post && (h.x_post.media || []).find((x) => x.type === "photo" && x.url);
    if (mo && mo.image) cands.push({ image: mo.image, post_url: mo.post_url, author: mo.author, at: h.at, from: h.id });
    else if (ph) cands.push({ image: ph.url, post_url: h.x_post.url, author: h.x_post.author.username, at: h.at, from: h.id });
  }
  for (const pk of picks || []) if (pk && pk.category === stage && pk.image && new RegExp(`\\b${key.replace(/^PAD/, "Pad ?").replace(/^S(?=\\d)/, "(S|Ship ?)").replace(/^B(?=\\d)/, "(B|Booster ?)")}\\b`, "i").test(pk.entry || "")) cands.push({ image: pk.image, post_url: pk.post_url, author: pk.author, at: pk.at || null, from: "road-media", prefer: !!pk.context_only });
  cands.sort((a, b) => (!!b.prefer - !!a.prefer) || (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)); // a hand-checked clear context shot wins, else newest
  const best = cands[0]; if (best) delete best.prefer;
  return best || null;
}
function placePost(road, post, cls, now = Date.now(), picks = []) {
  cls = { ...cls, text: require("./push-sync.js").cleanText(cls.text) }; // no public source names in app text
  const statusLine = logText_.cleanStatusLine(cls.status_line); // overview line (short); null → the box falls back to a shortened log line
  const logText = logText_.cleanLogText(cls.log_text) || logText_.cleanLogText(cls.text); // Flight Log line; falls back to text only when it passes the style lint
  const logDate = dayLabel(post.created_at); // the source post's own day, no time
  if (cls.stage !== "faa" && cls.stage !== "date") { const pb = require("./purpose.js").purposeFor(road, cls.text || "", post.text || "", { hardware: cls.hardware, box: cls.stage, confidence: cls.confidence, at: post.created_at }).box; if (pb !== cls.stage && road.categories.some((c) => c.id === pb)) cls = { ...cls, stage: pb }; }
  const box = road.categories.find((c) => c.id === cls.stage);
  let m = postMedia(post);
  if (cls.media_fit === "unrelated") m = null; // a picture that contradicts the text is worse than none
  const at = Date.parse(post.created_at) || now;
  const key = hwKey(cls.hardware);
  const flight = Number.isInteger(cls.flight) ? cls.flight : road.flight;
  const type = MILESTONE_TYPES.includes(cls.event) ? cls.event : null;
  const tier = tiers.tierOf(post, cls);
  const claimed = phaseOf(cls);
  // only Tier 1 moves a milestone past Expected; Tier 2 adds reported build-up; Tier 3 is Expected/rumour only
  const hedge = tier === 1 && tiers.hedged(cls); // Tier 1 "expected/hopefully" wording: label Expected, never Rumour
  // Tier 1 (Confirmed) and Tier 2 (Reported) move a milestone; Tier 3 rumours, hedged wording and inferred completions stay Expected/as-is
  const phase = tier <= 2 && !hedge && !cls.inferred ? claimed : "expected";
  const accurate = factsMatch(cls, post);
  const all = road.categories.flatMap((c) => (c.history || []).map((h) => ({ c, h })));
  // lifecycle: the open entry for this (milestone type + flight + vehicle), or the same completion re-reported within 48h
  const mk = type && milestoneKey(type, flight, cls.hardware);
  const life = mk && all.find(({ c, h }) => c.id === cls.stage && h.milestone && h.milestone.key === mk && (h.milestone.phase !== "completed" || Math.abs(at - Date.parse(h.at)) <= MERGE_MS));
  if (life) {
    const h = life.h, from = h.milestone.phase;
    h.x_posts = [...new Set([...(h.x_posts || []), post.post_id])];
    if ((tier === 3 || cls.inferred) && h.milestone.phase !== "expected") { // a rumour never rewrites an advanced entry: it goes under it as a line
      if (cls.inferred) h.trust = "unconfirmed";
      h.updates = [{ date: dayLabel(post.created_at), log_date: logDate, at: new Date(at).toISOString(), text: cls.text, ...(logText ? { log_text: logText } : {}), url: post.url, src: `@${post.author.username}`, tier, reported: claimed }, ...(h.updates || [])].slice(0, 20);
      return { box: life.c, entry: h, merged: true, phase: null, accurate, tier };
    }
    const to = accurate && PHASES.indexOf(phase) > PHASES.indexOf(from) ? phase : from;
    if (to !== from || h.text !== cls.text) { // build-up: the older line goes under the entry; the entry shows the latest
      h.updates = [{ date: h.date, ...(h.log_date ? { log_date: h.log_date } : {}), at: h.at, text: h.x_text || h.text, ...(h.log_text ? { log_text: h.log_text } : {}), url: h.url, src: h.src, phase: from, tier: h.tier }, ...(h.updates || [])].slice(0, 20);
      h.tier = tier; if (hedge) h.hedged = true; else delete h.hedged; if (tier === 3 && claimed !== "expected") h.reported = claimed; else delete h.reported;
      if (cls.inferred) h.trust = "unconfirmed"; // the writer inferred the step from indirect evidence: shown, never moves a phase
      // a confirmed milestone card (media-cascade text_locked): wording, time, link and source post stay; only the phase moves
      if (h.text_locked) { h.updates.shift(); } else {
      if (logText) h.log_text = logText; else delete h.log_text;
      if (statusLine) h.status_line = statusLine; else delete h.status_line;
      Object.assign(h, { date: dayLabel(post.created_at), log_date: logDate, at: new Date(at).toISOString(), text: cls.text, x_text: cls.text, url: post.url, src: `@${post.author.username}`, x_post: post });
      }
    }
    if (h.updates) h.updates = h.updates.filter((u) => !logText_.isRejected(road, life.c.id, u) && !logText_.isMonthMixup(h, u)); // a rejected or month-mixed-up line never comes back
    if (!accurate) h.updates[0] && (h.updates[0].note = "later post did not match the vehicle/pad numbers; status unchanged");
    if (m && (claimed === "completed" || cls.media_fit === "shows-event")) { if (!lockedMedia(h)) { h.media_override = overrideFor(post, m); delete h.frameChecked; if (h.alt_media) h.alt_media.show = false; } delete h.media_context; } // real media of the event itself
    else if (!h.media_override && !h.media_context) { const cx = contextImage(road, cls.stage, cls.hardware, h.id, picks); if (cx) h.media_context = cx; }
    h.milestone.phase = to;
    if (to === "completed") { h.complete = true; if (!h.completed_at && claimed === "completed") { h.completed_at = new Date(at).toISOString(); h.completed_src = post.url; } } // header time: the first post reporting the completion
    if (h.log_text && h.trust !== "unconfirmed" && !(h.flight > road.flight)) life.c.log_latest = h.status_line || require("./cleanup.js").shortLine(h.log_text); // the section's current outcome
    return { box: life.c, entry: h, merged: true, phase: to !== from ? { from, to } : null, accurate, tier };
  }
  const prev = !type && key && all.find(({ c, h }) => h.x_first && !h.milestone && c.id === cls.stage && hwKey(h.hardware) === key && Math.abs(at - Date.parse(h.at)) <= MERGE_MS);
  if (prev) {
    const h = prev.h;
    h.x_posts = [...new Set([...(h.x_posts || []), post.post_id])];
    const cur = h.media_override ? { type: h.media_override.type } : null;
    if (m && mediaRank(m) > mediaRank(cur) && !lockedMedia(h)) { h.media_override = overrideFor(post, m); delete h.frameChecked; if (h.alt_media) h.alt_media.show = false; h.x_post = post; h.url = post.url; }
    return { box: prev.c, entry: h, merged: true, accurate, tier };
  }
  const official = OFFICIAL.has(post.author.username.toLowerCase());
  const entry = { id: "x-" + post.post_id, date: dayLabel(post.created_at), log_date: logDate, at: new Date(at).toISOString(), text: cls.text, x_text: cls.text, ...(logText ? { log_text: logText } : {}), ...(statusLine ? { status_line: statusLine } : {}),
    url: post.url, src: `@${post.author.username}`, trust: "trusted", ...(official ? { official: true } : {}), x_first: true, stage: cls.stage,
    hardware: cls.hardware || null, ...(Number.isInteger(cls.flight) ? { flight: cls.flight } : {}) /* optional flight tag (not asked for yet: untagged = the app's default) */, x_post: post, x_posts: [post.post_id], xChecked: true, imageChecked2: true,
    ...(m && (claimed !== "expected" || cls.media_fit === "shows-event") ? { media_override: overrideFor(post, m) } : {}) };
  if (!accurate) entry.trust = "unconfirmed"; // numbers in the line aren't in the post: shown with the Unconfirmed tag, never moves a status
  entry.tier = tier; if (hedge) entry.hedged = true; if (tier === 3 && claimed !== "expected") entry.reported = claimed;
  if (cls.inferred) entry.trust = "unconfirmed";
  if (type) { entry.milestone = { key: mk, type, flight, hardware: key || null, phase }; if (!Number.isInteger(entry.flight) && flight !== road.flight) entry.flight = flight; if (phase === "completed") entry.complete = true; }
  if (!entry.media_override && type) { const cx = contextImage(road, cls.stage, cls.hardware, entry.id, picks); if (cx) entry.media_context = cx; }
  box.history = [entry, ...(box.history || [])].slice(0, 12);
  if (!(entry.flight > road.flight) && entry.trust !== "unconfirmed") { box.latest = cls.text.slice(0, 160); if (statusLine || logText) box.log_latest = statusLine || require("./cleanup.js").shortLine(logText); } // a later flight's post never becomes this flight's headline
  return { box, entry, merged: false, accurate, tier, phase: type ? { from: null, to: phase } : null };
}


// Guards run before a road post becomes a card (no card → no push).
// 1. Propellant loading / chill-down / frost on a vehicle that already finished cryo, or that is in its
//    static fire campaign, is the static fire flow — never a new cryo test.
const CHILL = /\b(frost\w*|propellant|prop[- ]?load\w*|loading|chill[- ]?down|chilling|lox|ch4|methane|detank\w*|vent\w*|tanking)\b/i;
const EXPLICIT_CRYO = /\b(cryo\w*|proof[- ]?test\w*|massey'?s)\b/i;
const EVENT_WORDS = { cryo_test: /\b(cryo\w*|proof[- ]?test\w*)\b/i, static_fire: /\bstatic[- ]?fir\w*|\bspin[- ]?prime\b/i, engines_installed: /\b(raptors?|engines?)\b/i, stacked: /\bstack\w*/i, wdr: /\b(wdr|wet dress)\b/i, licence: /\blicen[cs]e\b/i };
const NEW_TEST = /\b(new|another|second|third|again|repeat\w*|re-?test\w*|additional|more)\b/i;
const sentences = (t) => String(t || "").replace(/https?:\/\/\S+/g, " ").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
const doneFor = (road, type, flight, hw) => { const mk = milestoneKey(type, flight, hw); return road.categories.some((c) => (c.history || []).some((h) => h.milestone && h.milestone.key === mk && h.milestone.phase === "completed")); };
const staticBox = (road) => road.categories.find((c) => c.id === "static") || road.categories.find((c) => /static/i.test(c.name || ""));
const MASSEY = /\bmassey'?s?\b/i;
const CRYO_DONE_RE = /\b(complet\w*|finish\w*|done|after)\b[^.]*\bcryo|\bcryo\w*[^.]*\b(complete\w*|done|finished)\b/i;
// Cryo finished for this vehicle? milestone record, or a "completed … cryo" line in the cryo box naming it.
function cryoDone(road, hw, flight = road.flight) {
  if (!hw) return false;
  if (doneFor(road, "cryo_test", flight, hw)) return true;
  const key = hwKey(hw), cb = road.categories.find((c) => c.id === "cryo");
  return !!(cb && (cb.history || []).some((h) => normIds(`${h.hardware || ""} ${h.text || ""}`).includes(key) && CRYO_DONE_RE.test(h.text || "")));
}
// "static" | "cryo" | null for a Massey's post (null: not about Massey's).
function masseyStage(road, text, hw, flight) {
  if (!MASSEY.test(text || "")) return null;
  if (/\bstatic[- ]?fir\w*|\bspin[- ]?prime|\bengine test|\braptor\w* (?:test|fir)/i.test(text)) return "static";
  if (/\b(new|another|additional|re-?)\s*cryo/i.test(text)) return "cryo";
  if (cryoDone(road, hw, flight)) return "static";
  return /\bcryo|proof/i.test(text) ? "cryo" : null;
}
function guardPost(road, post, v) {
  if (!v || v.kind !== "road") return { v };
  const flight = Number.isInteger(v.flight) ? v.flight : road.flight, hw = v.hardware, text = post.text || "";
  const tier = tiers.tierOf(post, v);
  const isCryo = v.event === "cryo_test" || v.stage === "cryo";
  // (1) chill-down / prop load → static fire
  if (isCryo && hw && CHILL.test(text) && !EXPLICIT_CRYO.test(text)) {
    const sb = staticBox(road);
    const inStatic = /static/i.test(text) || doneFor(road, "cryo_test", flight, hw) || (sb && (sb.history || []).some((h) => hwKey(h.hardware) === hwKey(hw)));
    if (sb && inStatic) v = { ...v, stage: sb.id, event: "static_fire", phase: v.phase === "completed" ? "progress" : v.phase, status: v.status === "done" ? "progress" : v.status, reason: `${v.reason || ""} [guard: propellant load/chill-down during static fire → static fire, not cryo]` };
  }
  // (1b) Massey's never defaults to cryo: purpose + vehicle state decide. A vehicle that already completed cryo
  //      (or a post that names a static fire / engine test) going to / at Massey's is the static fire campaign.
  const m = masseyStage(road, text, hw, flight);
  if (m === "static" && (v.event === "cryo_test" || v.stage === "cryo")) {
    const sb = staticBox(road);
    if (sb) v = { ...v, stage: sb.id, event: "static_fire", phase: v.phase === "completed" && !/static|fir/i.test(text) ? "progress" : v.phase, reason: `${v.reason || ""} [guard: Massey's trip after cryo done → static fire, not cryo]` };
  }
  const type = MILESTONE_TYPES.includes(v.event) ? v.event : null;
  // (2) vehicle and event from the SAME sentence of the post
  if (type && hw && EVENT_WORDS[type]) {
    const key = hwKey(hw), ss = sentences(text);
    const has = (s) => normIds(s).includes(key.replace(/^PAD/, "P"));
    if (ss.some((s) => EVENT_WORDS[type].test(s)) && !ss.some((s) => has(s) && EVENT_WORDS[type].test(s))) return { skip: `vehicle ${hw} and ${type} are not in the same sentence of the post` };
  }
  // (3) a vehicle that already completed this section: no card, no push — unless a Tier 1 source explicitly says a new test
  if (type && hw && doneFor(road, type, flight, hw)) {
    const explicitNew = tier === 1 && sentences(text).some((s) => EVENT_WORDS[type] && EVENT_WORDS[type].test(s) && NEW_TEST.test(s));
    const sameReport = phaseOf(v) === "completed"; // a re-report of the completion merges as before (no status move)
    if (!explicitNew && !sameReport) return { skip: `${hw} already completed ${type} for Flight ${flight}; only a Tier 1 post explicitly saying a new test re-opens it` };
  }
  return { v };
}

// The whole step. ask(prompt, opts) → JSON (writer.askJson). Returns cards, news items, state.
async function runXFirst(road, state, { token, fetchFn, ask, postCard, log = console.log, now = Date.now(), maxCards = 5, status = null, milestone = null, linkFetch = null, picks = [], pushHistory = null }) {
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
    catch (e) { log(`X-first: writer failed (${e.message}) — posts retried next run`); return { cards: [], merged: [], news: [], missions: [], state: { ...xs }, calls: got.calls, read: got.read || 0, retry: true, posts: got.posts || [] }; /* since_id not advanced */ }
  }
  const cards = [], merged = [], newsItems = [], missions = [], r0 = {};
  posts.forEach((p, i) => {
    let v = verdicts[i];
    seen.add(p.post_id);
    if (v.reason === "no verdict" && !p.retry) { seen.delete(p.post_id); waiting.push({ ...p, retry: 1 }); return log(`X-first: no verdict for @${p.author.username} ${p.post_id} — retried next run`); } // the writer skipped it: one more try
    if (v.kind === "mission-update") { // that flight's mission line (no Road card); shares the per-run cap
      if (cards.length + missions.length >= maxCards) { seen.delete(p.post_id); waiting.push(p); return log(`X-first: cap reached — @${p.author.username} ${p.post_id} waits`); }
      missions.push({ post: p, topic: v.topic, text: v.text, attribution: v.attribution || null });
      return log(`X-first: mission-update/${v.topic} @${p.author.username} ${p.post_id} — ${v.text}`);
    }
    if (v.kind === "starship-news") newsItems.push({ key: `x:${p.post_id}`, title: p.text.slice(0, 200), text: p.text, url: p.url, publishedAt: p.created_at, src: `X @${p.author.username}`, source: `@${p.author.username}`, tier: OFFICIAL.has(p.author.username.toLowerCase()) ? "official" : "trusted" });
    if (v.kind !== "road") return log(`X-first: ${v.kind} @${p.author.username} ${p.post_id} — ${v.reason || ""}`);
    const g = guardPost(road, p, v);
    if (g.skip) return log(`X-first: guard skipped @${p.author.username} ${p.post_id} — ${g.skip}`);
    if (g.v !== v) { log(`X-first: guard re-staged @${p.author.username} ${p.post_id} ${v.stage} → ${g.v.stage}`); v = g.v; verdicts[i] = v; }
    if (cards.length + missions.length >= maxCards) { seen.delete(p.post_id); waiting.push(p); return log(`X-first: card cap reached — @${p.author.username} ${p.post_id} waits`); }
    if (pushHistory && v.event) { // B. staleness: a recap or a re-report of a milestone already pushed on an earlier day makes no card (and no push)
      const st = require("./push-gate.js").staleCheck({ title: "", body: v.log_text || v.text || "", at: p.created_at, url: p.url, source_text: p.text, has_media: !!(p.media && p.media.length) }, pushHistory, { vehicles: road.vehicles || [] });
      if (st.stale) { (r0.stale = r0.stale || []).push({ post: p, reason: st.reason, media_only: !!st.media_only }); return log(`X-first: stale @${p.author.username} ${p.post_id} — ${st.reason}${st.media_only ? " (media-only: the cascade may swap the picture)" : ""} — no card, no push`); }
    }
    const r = placePost(road, p, v, now, picks);
    if (status && v.status && r.accurate !== false && r.tier <= 2 && !v.inferred && (!Number.isInteger(r.entry.flight) || r.entry.flight === road.flight)) r.st = status(r.box, v.status, p, r.entry); // unverified numbers never move a status
    if (milestone && v.event && phaseOf(v) === "completed" && r.accurate !== false && r.tier <= 2 && !v.inferred) milestone(v, p); // running per-vehicle summary (counts + dates)
    if (!r.st && r.accurate !== false && !v.inferred) { const want = logText_.rollupStatus(r.box, road); if (want === "done" && r.box.status !== "done") { r.st = { from: r.box.status, to: "done" }; r.box.status = "done"; log(`STATUS [${r.box.id}] ${r.st.from} → done (every Flight ${road.flight} vehicle completed)`); } }
    r.post = p; // the post itself (a merge keeps the older card, but the status line uses this post's own time)
    (r.merged ? merged : cards).push(r);
    log(`X-first: road/${v.stage} ${v.hardware || "-"} @${p.author.username} ${p.post_id} → ${r.merged ? `merged into ${r.entry.id}` : `new card ${r.entry.id}`}`);
  });
  return { cards, merged, news: newsItems, missions, stale: r0.stale || [], state: { sinceId: got.sinceId, seen: [...seen].slice(-500), pending: waiting.slice(0, 20) }, calls: got.calls, read: got.read || 0, posts: got.posts || [] };
}

const isOfficial = (p) => OFFICIAL.has(String(p.author && p.author.username).toLowerCase());
module.exports = { masseyStage, cryoDone, guardPost, MILESTONE_TYPES, PHASES, factsMatch, contextImage, milestoneKey, phaseOf, isOfficial, MISSION_TOPICS, runXFirst, fetchNewPosts, classifyPosts, classifyPrompt, placePost, bestMedia, postMedia, articleLead, readLinks, hwKey, xfQuery, XF_ACCOUNTS, CLASSIFY_SCHEMA, MERGE_MS };
