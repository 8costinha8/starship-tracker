/* ───────────── media upgrade watch ─────────────
   Published Road cards (last 7 days) keep watching X for a better picture of the SAME event:
   Tier 1/2 accounts + MEDIA_TRACKERS, above an engagement minimum. A card's picture is swapped
   only when the candidate clearly wins (score ≥ 1.5× the current one AND quality not lower):
   never a downgrade, text unchanged, never a push, one image per card (two only for a sure, clearly different angle — see decidePair), original X image (natural
   brightness). Manual picks (road-media.json) and keep_image are never touched; a ship cryo card
   (Bernardo's standing photo) only gets a logged PROPOSAL. Credit: the card links to the
   creator's post; the handle stays in the View on X aria label (no visible line).
   Cost: runs at most once an hour inside the 15-min check-road run; ≤ 2 X calls per watch
   (1 tweets?ids metrics refresh + 1 search/recent). */
const tiers = require("./source-tiers.js");

const MEDIA_TRACKERS = ["colleenadastra", "StarbaseWatcher", "BocaChicaGal"];
const EVERY_MS = 60 * 60000, WINDOW_MS = 48 * 3600000, LOOKBACK_MS = 7 * 86400000;
const RATIO = 1.5, MIN_CONF = 0.8;
const GATE = { 1: { likes: 50, views: 3000 }, 2: { likes: 30, views: 1500 }, tracker: { likes: 30, views: 1500 } };
const WEIGHT = { 1: 1.0, 2: 0.9, tracker: 0.8 };
const X_FIELDS = { "tweet.fields": "created_at,author_id,attachments,public_metrics,note_tweet", expansions: "attachments.media_keys,author_id",
  "media.fields": "type,url,preview_image_url,width,height,public_metrics,alt_text", "user.fields": "username,name" };

const lc = (s) => String(s || "").toLowerCase();
function sourceTier(handle) {
  const h = lc(handle);
  if (tiers.TIER1.some((a) => lc(a) === h)) return 1;
  if (MEDIA_TRACKERS.some((a) => lc(a) === h)) return "tracker"; // before Tier 2: BocaChicaGal/StarbaseWatcher are Tier 2 in sources.js but keep the media tracker gate
  if (tiers.TIER2.some((a) => lc(a) === h)) return 2;
  return null;
}
const watchAccounts = () => [...new Set([...tiers.TIER1, ...tiers.TIER2, ...MEDIA_TRACKERS])];
function engagement(pm = {}, media = []) {
  const views = Math.max(pm.impression_count || 0, ...media.map((m) => (m.public_metrics && m.public_metrics.view_count) || 0));
  return { likes: pm.like_count || 0, reposts: pm.retweet_count || pm.repost_count || 0, views };
}
const passesGate = (tier, e) => !!tier && (e.likes >= GATE[tier].likes || e.views >= GATE[tier].views);
const score = (tier, e, quality) => (WEIGHT[tier] || WEIGHT.tracker) * (e.likes + 2 * e.reposts + e.views / 100) * (quality / 5);
const isBetter = (cand, cur) => !cur || (cand.score >= RATIO * cur.score && cand.quality >= cur.quality);

const vehiclesOf = (t) => {
  const s = String(t || ""), out = new Set();
  for (const m of s.matchAll(/\b(?:booster\s?|b)(\d{2})\b/gi)) out.add("B" + m[1]);
  for (const m of s.matchAll(/\b(?:ship\s?|s)(\d{2})\b/gi)) out.add("S" + m[1]);
  return [...out];
};
const isShipCryo = (h, catId) => catId === "cryo" && vehiclesOf(`${h.x_text || ""} ${h.text || ""}`).some((v) => v[0] === "S") && !/\bbooster\b|\bb\d{2}\b/i.test(`${h.x_text || ""} ${h.text || ""}`);
const postIdOf = (h) => (h.media_override && h.media_override.post_id) || (h.x_post && h.x_post.post_id) || null;
const cardMs = (h) => Date.parse(h.at || "") || Date.parse((h.x_post && h.x_post.created_at) || "") || 0;
function lockedReason(h, catId, pickIds) {
  const mo = h.media_override;
  if (mo && mo.keep_image) return "keep_image";
  if (mo && mo.cascade) return "milestone cascade manages this card";
  if (mo && !mo.auto && mo.post_id && pickIds.has(String(mo.post_id))) return "manual pick";
  if (isShipCryo(h, catId)) return "ship cryo default (propose only)";
  return null;
}
function watchedCards(road, now) {
  const out = [];
  for (const c of road.categories || []) {
    if (c.id === "date") continue;
    for (const h of c.history || []) {
      if (!h || h.kind === "check" || h.feed_hide) continue;
      const at = cardMs(h);
      if (!at || now - at > LOOKBACK_MS) continue;
      const veh = vehiclesOf(`${h.x_text || ""} ${h.text || ""}`);
      if (veh.length) out.push({ c, h, at, veh });
    }
  }
  return out;
}

const VISION = { type: "object", additionalProperties: false, required: ["shows", "confidence", "quality", "collage", "seen"],
  properties: { shows: { type: "boolean" }, confidence: { type: "number" }, quality: { type: "integer" }, collage: { type: "boolean" }, seen: { type: "string" } } };
const visionPrompt = (entry, catName, post, m) => `You judge whether a picture is a clean, emblematic photo of a Starship tracker update.
Update (${catName}): ${entry}
X post text: ${post.text}
"shows": true ONLY if it clearly shows the same vehicle (or pad) AND the same event/activity as the update.
"confidence": 0 to 1. "quality": 1-5 (5 = clean, sharp, emblematic shot of the subject; 1 = dark, blurry, far-off).
"collage": true for a screengrab, multi-panel collage, livestream frame with ticker/overlays. "seen": a few words.
This picture is ${m.type === "video" ? "the poster frame of the post's video" : "a photo from the post"}. Reply with JSON only.`;
const SAME = { type: "object", additionalProperties: false, required: ["same"], properties: { same: { type: "boolean" }, reason: { type: "string" } } };
const samePrompt = (entry, post) => `Card: "${entry}"\nX post: "${post.text}"\n"same": true ONLY if the post shows the same event as the card (same vehicle AND same activity, e.g. the same lift or rollout). Reply with JSON only.`;

// ── two-photo split: default 1 picture; 2 only when the second shows a clearly different, relevant angle
// the first can't (e.g. a wide pad/chopsticks shot + an engine close-up), at high confidence. Single-shot
// events (static fire, rollout, cryo, spin prime, WDR, launch) always get 1 — in the prompt AND in this guard.
const PAIR_CONF = 0.9, MAX_IMAGES = 2;
const SINGLE_SHOT = /static[\s-]*fire|\bfiring\b|\bfired\b|spin[\s-]*prime|roll(?:ed|s|ing)?[\s-]*(?:out|back)|rollout|cryo|\bwdr\b|wet dress|propellant load|launch(?:ed|es)?\b|lift[\s-]*off/i;
const SINGLE_CATS = new Set(["cryo", "launch"]);
function singleShot(h, catId) {
  const t = `${h.x_text || ""} ${h.text || ""} ${h.log_text || ""}`;
  return SINGLE_CATS.has(catId) || SINGLE_SHOT.test(t);
}
const PAIR = { type: "object", additionalProperties: false, required: ["two", "confidence", "wide", "reason"], properties: { two: { type: "boolean" }, wide: { type: "integer" }, confidence: { type: "number" }, reason: { type: "string" } } };
const pairPrompt = (entry, catName) => `Two photos of the same Starship tracker update. Decide if the card should show BOTH side by side.
Update (${catName}): ${entry}
Default: false (one picture). "two": true ONLY if photo 2 shows a clearly DIFFERENT, relevant angle that photo 1 cannot
(e.g. a wide pad/chopsticks shot plus a close-up of the engines or the booster being lifted). Near-duplicates, the same angle,
crops of each other, or a weaker shot: false. Obvious single-shot events ALWAYS false: a static fire / engines firing,
a rollout or rollback, a cryo test, spin prime, wet dress rehearsal, launch.
"confidence": 0 to 1 (how sure two photos is better).
"wide": 1 or 2 — which photo is the wide/context shot (pad, chopsticks, whole vehicle); the other is the close-up.
The wide shot is shown LEFT, the close-up RIGHT. Reply with JSON only.`;
// { secondSide } only when the guard allows it, both images differ, and the model says two at ≥ PAIR_CONF
async function decidePair(A, h, cat, first, second) {
  if (!first || !second || !first.image || !second.image || first.image === second.image) return false;
  if (singleShot(h, cat && cat.id)) return false;
  if (!A.pair) return false;
  let v; try { v = await A.pair(pairPrompt(h.x_text || h.text, (cat && (cat.name || cat.id)) || ""), [first.image, second.image]); } catch { return false; }
  if (!(v && v.two === true && Number(v.confidence) >= PAIR_CONF)) return false;
  return { secondSide: Number(v.wide) === 2 ? "right" : "left" }; // first = the second picture; wide shot goes left
}

function defaultAsk() {
  const writer = require("./writer.js");
  return {
    vision: (prompt, url) => writer.askJson(prompt, { images: [url], schema: VISION, schemaName: "media_upgrade", maxTokens: 2000, claudeMaxTokens: 300, attempts: 1, log: () => {} }),
    pair: (prompt, urls) => writer.askJson(prompt, { images: urls.slice(0, MAX_IMAGES), schema: PAIR, schemaName: "media_pair", maxTokens: 1000, claudeMaxTokens: 200, attempts: 1, log: () => {} }),
    same: (prompt) => writer.askJson(prompt, { schema: SAME, schemaName: "same_event", maxTokens: 1000, claudeMaxTokens: 200, attempts: 1, log: () => {} }),
  };
}

function cardFromApi(p, mediaByKey, usersById) {
  const u = usersById[p.author_id] || {};
  const media = ((p.attachments && p.attachments.media_keys) || []).map((k) => mediaByKey[k]).filter(Boolean);
  return { post_id: p.id, url: `https://x.com/${u.username || "i"}/status/${p.id}`, created_at: p.created_at, author: u.username || "",
    text: (p.note_tweet && p.note_tweet.text) || p.text || "", e: engagement(p.public_metrics, media),
    media: media.map((m) => ({ type: m.type === "photo" ? "photo" : "video", image: m.type === "photo" ? m.url : m.preview_image_url })).filter((m) => m.image) };
}
async function xGet(fetchFn, token, url) {
  const r = await fetchFn(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`X ${r.status}`);
  const j = await r.json(), inc = j.includes || {};
  const mediaByKey = Object.fromEntries((inc.media || []).map((m) => [m.media_key, m])), usersById = Object.fromEntries((inc.users || []).map((x) => [x.id, x]));
  return (Array.isArray(j.data) ? j.data : j.data ? [j.data] : []).map((p) => cardFromApi(p, mediaByKey, usersById));
}
function searchQuery(cards) {
  const veh = [...new Set(cards.flatMap((x) => x.veh))];
  const terms = veh.flatMap((v) => (v[0] === "B" ? [v, `"Booster ${v.slice(1)}"`] : [v, `"Ship ${v.slice(1)}"`]));
  const q = (t) => `(${t.join(" OR ")}) (${watchAccounts().map((a) => `from:${a}`).join(" OR ")}) has:media -is:retweet -is:reply`;
  while (terms.length > 1 && q(terms).length > 512) terms.pop(); // X search query limit
  return q(terms);
}

async function runMediaWatch(road, state, { token, fetchFn = fetch, ask = null, picks = [], now = Date.now(), log = console.log } = {}) {
  const mw = (state.mediaWatch = state.mediaWatch || {});
  const res = { ran: false, calls: 0, swapped: [], proposals: [], skipped: [] };
  if (!token) return res;
  if (mw.lastAt && now - Date.parse(mw.lastAt) < EVERY_MS) return res; // hourly
  const cards = watchedCards(road, now);
  mw.lastAt = new Date(now).toISOString(); res.ran = true;
  if (!cards.length) return res;
  const pickIds = new Set(picks.map((p) => String(p.post_id || (String(p.post_url || "").match(/status\/(\d+)/) || [])[1] || "")).filter(Boolean));
  const A = ask || defaultAsk();
  // call 1: refresh the current media's metrics
  const ids = [...new Set(cards.map((x) => postIdOf(x.h)).filter(Boolean))].slice(0, 100);
  const current = {};
  if (ids.length) {
    try { (await xGet(fetchFn, token, `https://api.x.com/2/tweets?${new URLSearchParams({ ids: ids.join(","), ...X_FIELDS })}`)).forEach((p) => { current[p.post_id] = p; }); }
    catch (e) { log(`media watch: metrics refresh failed (${e.message})`); }
    res.calls++;
  }
  // call 2: candidates
  let posts = [];
  try {
    posts = await xGet(fetchFn, token, `https://api.x.com/2/tweets/search/recent?${new URLSearchParams({ query: searchQuery(cards), max_results: "25",
      start_time: new Date(Math.max(now - LOOKBACK_MS + 60000, Math.min(...cards.map((x) => x.at)) - WINDOW_MS)).toISOString(), ...X_FIELDS })}`);
  } catch (e) { log(`media watch: search failed (${e.message})`); }
  res.calls++;
  for (const post of posts) {
    const tier = sourceTier(post.author);
    if (!tier) { res.skipped.push(`@${post.author}: not a watched source`); continue; }
    if (!passesGate(tier, post.e)) { res.skipped.push(`@${post.author}: below engagement minimum`); continue; }
    const pv = vehiclesOf(post.text);
    for (const { c, h, at, veh } of cards) {
      if (postIdOf(h) === post.post_id) continue;
      if (!veh.some((v) => pv.includes(v))) continue;
      if (Math.abs(Date.parse(post.created_at) - at) > WINDOW_MS) { res.skipped.push(`@${post.author}: outside 48h of "${h.text}"`); continue; }
      let same; try { same = await A.same(samePrompt(h.x_text || h.text, post)); } catch { same = null; }
      if (!same || !same.same) continue;
      let best = null; const ok = [];
      for (const m of post.media.slice(0, 4)) {
        let v; try { v = await A.vision(visionPrompt(h.x_text || h.text, c.name || c.id, post, m), m.image); } catch { continue; }
        if (!v || !v.shows || v.confidence < MIN_CONF || v.collage) continue;
        ok.push({ m, v });
        if (!best || v.quality > best.v.quality) best = { m, v };
      }
      if (!best) continue;
      const cand = { score: score(tier, post.e, best.v.quality), quality: best.v.quality };
      const cp = current[postIdOf(h)];
      const curTier = sourceTier((h.media_override && h.media_override.author) || (cp && cp.author)) || "tracker";
      const curQ = Number.isInteger(h.media_override && h.media_override.quality) ? h.media_override.quality : 3;
      const cur = cp ? { score: score(curTier, cp.e, curQ), quality: curQ } : (h.media_override && h.media_override.media_score ? { score: h.media_override.media_score, quality: curQ } : null);
      if (!isBetter(cand, cur)) { res.skipped.push(`@${post.author}: not better for "${h.text}"`); continue; }
      const lock = lockedReason(h, c.id, pickIds);
      const label = `[${c.id}] ${h.date} "${h.text}" ← @${post.author} ${best.m.image} (score ${cand.score.toFixed(0)} vs ${cur ? cur.score.toFixed(0) : "none"})`;
      if (lock && /propose/.test(lock)) { res.proposals.push(label); mw.proposals = [...(mw.proposals || []).filter((x) => x.post_url !== post.url), { card: h.id || h.text, post_url: post.url, image: best.m.image, score: Math.round(cand.score), at: mw.lastAt }].slice(-20); log(`media watch PROPOSAL (no swap): ${label}`); continue; }
      if (lock) { res.skipped.push(`${lock}: "${h.text}"`); continue; }
      const prevMo = h.media_override && !h.media_override.credit_only ? { post_url: h.media_override.post_url, post_id: h.media_override.post_id, author: h.media_override.author, type: h.media_override.type, image: h.media_override.image } : null;
      h.media_override = { post_url: post.url, post_id: post.post_id, author: post.author, type: best.m.type, image: best.m.image, auto: true, quality: best.v.quality, media_score: Math.round(cand.score), checked_at: mw.lastAt };
      // second picture (left): a strong other photo from this post, else the picture it replaces — only if Grok is sure
      const other = ok.filter((x) => x.m.image !== best.m.image && x.m.type === "photo" && x.v.quality >= 4).sort((a, b) => b.v.quality - a.v.quality)[0];
      const second = other ? { post_url: post.url, post_id: post.post_id, author: post.author, type: "photo", image: other.m.image } : prevMo;
      const pr = second && (await decidePair(A, h, c, second, h.media_override));
      if (pr) { h.alt_media = { ...second, show: true, side: pr.secondSide }; log(`media watch: two-photo split for "${h.text}"`); }
      else if (second) h.alt_media = { ...second, show: false }; else if (h.alt_media) h.alt_media.show = false;
      delete h.media_context;
      res.swapped.push(label); log(`media watch SWAP (no push): ${label}`);
    }
  }
  return res;
}

module.exports = { PAIR_CONF, MAX_IMAGES, SINGLE_SHOT, singleShot, pairPrompt, decidePair, MEDIA_TRACKERS, GATE, WEIGHT, RATIO, EVERY_MS, WINDOW_MS, sourceTier, engagement, passesGate, score, isBetter, vehiclesOf, isShipCryo, lockedReason, watchedCards, searchQuery, runMediaWatch, watchAccounts };
