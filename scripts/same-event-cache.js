/* same_event verdict cache (1 Nov). Stored in the repo (data/same-event-cache.json), committed by the checker.
   Key: "<post id>|<card key>". Each entry keeps a hash of the post text AND the card text it was judged against, so an
   edited post (or an edited card) is judged again; an unchanged pair is never re-asked. A cached verdict is the exact
   boolean Grok returned, so the media-watch outcome is the same as with a fresh call. Failed calls are never cached. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const FILE = path.join(__dirname, "..", "data", "same-event-cache.json");
const KEEP_MS = 30 * 864e5; // verdicts older than 30 days are dropped (no watched card can use those posts any more)
const MAX_SAME = 20;        // hard cap on same_event Grok calls per run; the rest queue for the next run
const norm = (t) => String(t || "").replace(/\s+/g, " ").trim();
const hashOf = (postText, cardText) => crypto.createHash("sha256").update(`${norm(postText)}\n${norm(cardText)}`).digest("hex").slice(0, 16);
const keyOf = (postId, cardKey) => `${postId}|${cardKey}`;
function load(file = FILE) { try { const c = JSON.parse(fs.readFileSync(file, "utf8")); if (c && c.entries && typeof c.entries === "object") return { v: 1, entries: c.entries, dirty: false }; } catch {} return { v: 1, entries: {}, dirty: false }; }
// a verdict (true/false) only when the post and card text are unchanged since it was judged; else undefined (ask Grok)
function get(cache, postId, cardKey, postText, cardText) { const e = cache && cache.entries[keyOf(postId, cardKey)]; return e && e.h === hashOf(postText, cardText) && typeof e.same === "boolean" ? e.same : undefined; }
function set(cache, postId, cardKey, postText, cardText, same, at) { if (!cache || typeof same !== "boolean") return; cache.entries[keyOf(postId, cardKey)] = { h: hashOf(postText, cardText), same, at }; cache.dirty = true; }
const has = (cache, postId, cardKey) => !!cache && !!cache.entries[keyOf(postId, cardKey)];
const judgedPost = (cache, postId) => !!cache && Object.keys(cache.entries).some((k) => k.startsWith(`${postId}|`));
function prune(cache, now = Date.now()) { for (const [k, e] of Object.entries(cache.entries)) if (!e || now - Date.parse(e.at || 0) > KEEP_MS) { delete cache.entries[k]; cache.dirty = true; } }
function save(cache, file = FILE) { const sorted = Object.fromEntries(Object.entries(cache.entries).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ v: 1, note: "same_event Grok verdicts per (post, card); h = hash of post + card text (an edit re-judges). Written by check-road.js media watch.", entries: sorted }, null, 2) + "\n"); cache.dirty = false; }
module.exports = { has, FILE, KEEP_MS, MAX_SAME, hashOf, keyOf, load, get, set, judgedPost, prune, save };
