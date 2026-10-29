/* Milestone media cascade (builds on media-watch; no writer, no extra X calls, never a push).
   Input: the posts the checker already fetched this run (X-first). For each milestone Road card:
   1. Same event, without the writer: same vehicle + same milestone type (push-policy classify) + within SAME_EVENT_H.
   2. Sources are tiered (config.js): 1 SpaceX's own accounts, 2 NSF and similar outlets, 3 anyone else.
   3. Confirmation: a tier 1 or 2 source, or 2 distinct sources. Until then the card's wording AND media stay as they
      are (a tier 3 post is a first signal only). On confirmation the wording locks (text_locked) for good.
   4. Media keeps rotating: the card follows the best source (image AND link AND source post) while it improves,
      inside ASSESS_WINDOW_DAYS of the card's first appearance; tier 1 swaps in immediately, also after the window.
   5. Video candidates: best-frame pixel ranking; for static fire / launch the frame must show the engines lit.
   6. Never: a swap over keep_image, a manual pick (road-media.json), the ship cryo standing photo; a caption or label;
      a later card time (the earliest trusted time is kept); a push. */
const fs = require("fs"), path = require("path");
const cfg = require("./config.js"), pp = require("./push-policy.js"), mw = require("./media-watch.js");
const SAME_EVENT_H = 36, LIT_MIN = 0.004, EARLIER_MAX_H = 3;
const lc = (s) => String(s || "").toLowerCase();
function tierOf(handle) {
  const h = lc(String(handle || "").replace(/^@/, ""));
  if (cfg.CASCADE_TIER1.some((a) => lc(a) === h)) return 1;
  if (cfg.CASCADE_TIER2.some((a) => lc(a) === h)) return 2;
  return 3;
}
const handleOf = (p) => (p && p.author && (p.author.username || p.author)) || "";
const textOf = (h) => `${h.x_text || ""} ${h.text || ""}`;
const eventOfText = (t) => { const c = pp.classify({ title: "", body: t, at: new Date().toISOString() }); return c.milestone ? c.type : null; };
// same event without the writer: vehicle overlap, same milestone type, close in time
function sameEvent(h, post) {
  const ev = eventOfText(textOf(h)); if (!ev) return false;
  const pv = mw.vehiclesOf(post.text), hv = mw.vehiclesOf(textOf(h));
  if (!hv.some((v) => pv.includes(v))) return false;
  const pev = eventOfText(post.text);
  // a static fire card also matches a later "completed both its single- and six-engine static fire" post
  if (pev !== ev) return false;
  const a = Date.parse(h.cascade && h.cascade.first_at || h.at || ""), b = Date.parse(post.created_at || "");
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b - a) <= SAME_EVENT_H * 3600000;
}
const litEvent = (ev) => ev === "static_fire" || ev === "launch";
// media quality of a post for this event: { q, image, type, lit, frame } or null (nothing usable)
async function mediaOf(post, ev, frameFor) {
  let best = null;
  for (const m of post.media || []) {
    let f = null; try { f = await frameFor(post, m, ev); } catch { f = null; }
    if (!f || !f.image) continue;
    if (litEvent(ev) && !f.lit) continue; // static fire / launch: engines must be visibly lit
    const q = (m.type === "video" ? 2 : 1) + Math.min(1, f.score || 0);
    if (!best || q > best.q) best = { q, image: f.image, type: m.type, frame: f.frame, thumb: m.poster || null };
  }
  return best;
}
const quality = (tier, med) => (4 - tier) * 10 + (med ? med.q : 0);
// default frame picker: pixel ranking only (best-frame.js), no writer
function defaultFrameFor({ root = path.join(__dirname, ".."), fetchFn = fetch } = {}) {
  const bf = require("./best-frame.js");
  return async (post, m, ev) => {
    if (!bf.hasFfmpeg()) return null;
    const event = litEvent(ev) ? (ev === "launch" ? "launch" : "static") : bf.eventOf("", post.text) || "rollout";
    const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "mc-"));
    try {
      const get = async (u, f) => { const r = await fetchFn(u); if (!r.ok) throw new Error(`download ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; };
      if (m.type === "video" && m.video_url) {
        const { ranked } = bf.rankFrames(bf.extractFrames(await get(m.video_url, path.join(tmp, "v.mp4")), path.join(tmp, "fr")), event);
        const top = ranked[0]; if (!top) return null;
        const rel = `images/${post.post_id}-frame.jpg`;
        require("child_process").spawnSync("ffmpeg", ["-v", "error", "-y", "-i", top.file, "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", path.join(root, rel)]);
        return { image: rel, lit: top.plume >= LIT_MIN, score: top.score, frame: { t: top.t, by: "pixel-rank (best-frame.js), cascade" }, file: rel };
      }
      if (m.type === "photo" && m.url) { const s = bf.scoreFile(await get(m.url, path.join(tmp, "p.jpg")), event); return { image: m.url, lit: s.plume >= LIT_MIN, score: s.score }; }
      return null;
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  };
}
/* one milestone = one card, climbing the source tiers (one-way): trackers (3) → outlets such as NSF (2) → SpaceX (1).
   A lower tier never replaces a higher tier's media; SpaceX's own post does the final swap and LOCKS the card
   (media_locked + text_locked): no more media or wording changes after that. */
function climbTier(handle) { const t = tierOf(handle); if (t === 1) return 1; return (cfg.CASCADE_OUTLETS || ["NASASpaceflight"]).some((a) => lc(a) === lc(String(handle || "").replace(/^@/, ""))) ? 2 : t === 2 ? 3 : 4; }
function locked(h, cat, pickIds) {
  if (h.media_locked) return "locked by SpaceX's own post";
  const mo = h.media_override || {};
  if (mo.keep_image) return "keep_image";
  if (mo.post_id && !mo.auto && !mo.cascade && pickIds.has(String(mo.post_id))) return "manual pick";
  if (mw.isShipCryo(h, cat.id)) return "ship cryo standing photo";
  return null;
}
async function runCascade(road, posts, { now = Date.now(), picks = [], frameFor = null, log = () => {} } = {}) {
  const res = { swapped: [], confirmed: [], skipped: [], files: [] };
  if (!posts || !posts.length) return res;
  const ff = frameFor || defaultFrameFor();
  if (!Array.isArray(picks)) picks = (picks && picks.picks) || [];
  const pickIds = new Set(picks.map((p) => String(p.post_id || (String(p.post_url || "").match(/status\/(\d+)/) || [])[1] || "")).filter(Boolean));
  const winMs = cfg.ASSESS_WINDOW_DAYS * 86400000;
  for (const cat of road.categories || []) {
    if (cat.id === "date") continue;
    for (const h of cat.history || []) {
      if (!h || !h.id || h.kind === "check" || h.feed_hide) continue;
      const ev = eventOfText(textOf(h)); if (!ev) continue;
      const own = { post_id: (h.x_post && h.x_post.post_id) || (String(h.url || "").match(/status\/(\d+)/) || [])[1], author: (h.src || "").replace(/^@/, "") || handleOf(h.x_post) };
      const cs = (h.cascade = h.cascade || { first_at: h.at, sources: own.post_id ? [{ post_id: own.post_id, author: own.author, tier: tierOf(own.author), at: h.at }] : [] });
      const matches = posts.filter((p) => p && p.post_id && sameEvent(h, p));
      if (!matches.length) continue;
      for (const p of matches) if (!cs.sources.some((s) => s.post_id === p.post_id)) cs.sources.push({ post_id: p.post_id, author: handleOf(p), tier: tierOf(handleOf(p)), at: p.created_at });
      const authors = new Set(cs.sources.map((s) => lc(s.author)));
      const confirmed = cs.sources.some((s) => s.tier <= 2) || authors.size >= 2;
      if (confirmed && !cs.confirmed) { cs.confirmed = true; cs.confirmed_at = new Date(now).toISOString(); h.text_locked = true; res.confirmed.push(h.id); log(`cascade: "${h.text}" confirmed — wording locked`); }
      // earliest trusted time: never later; earlier only from a tier 1/2 post
      for (const s of cs.sources) if (s.tier <= 2 && Date.parse(s.at) < Date.parse(h.at || "") && Date.parse(h.at) - Date.parse(s.at) <= EARLIER_MAX_H * 3600000) { /* same moment reported earlier, not a separate earlier firing */ h.at = s.at; if (h.completed_at && Date.parse(s.at) < Date.parse(h.completed_at)) h.completed_at = s.at; }
      if (!cs.confirmed) { res.skipped.push(`${h.id}: not confirmed yet (media held)`); continue; }
      const why = locked(h, cat, pickIds); if (why) { res.skipped.push(`${h.id}: ${why}`); continue; }
      const inWindow = now - Date.parse(cs.first_at || h.at) <= winMs;
      let curTier = climbTier((h.media_override && h.media_override.author) || own.author);
      let cur = Number.isFinite(cs.best_q) ? cs.best_q : quality(curTier, h.media_override && h.media_override.image ? { q: 1 } : null);
      for (const p of matches.sort((a, b) => climbTier(handleOf(b)) - climbTier(handleOf(a)))) { // lower tiers first, SpaceX last
        if (h.media_locked) break;
        const t = tierOf(handleOf(p)), ct = climbTier(handleOf(p));
        if (t === 3) continue; // tier 3: a first signal only
        if (ct > curTier) { res.skipped.push(`${h.id}: @${handleOf(p)} is a lower tier than the card's media (one-way climb)`); continue; }
        if (!inWindow && t !== 1) { res.skipped.push(`${h.id}: @${handleOf(p)} outside the ${cfg.ASSESS_WINDOW_DAYS}-day window`); continue; }
        if (String(p.post_id) === String(h.media_override && h.media_override.post_id)) continue;
        const med = await mediaOf(p, ev, ff);
        if (!med) { res.skipped.push(`${h.id}: @${handleOf(p)} has no usable${litEvent(ev) ? " engine-lit" : ""} picture`); continue; }
        const q = quality(t, med);
        if (ct === curTier && q <= cur) { res.skipped.push(`${h.id}: @${handleOf(p)} not better`); continue; }
        // swap image AND link AND source post; text stays (locked); no caption, no label, no push
        h.url = p.url; h.src = `@${handleOf(p)}`; h.tier = Math.min(t, 2);
        h.x_post = { post_id: p.post_id, url: p.url, created_at: p.created_at, text: p.text, author: p.author, media: p.media || [] };
        h.media_override = { post_url: p.url, post_id: p.post_id, author: handleOf(p), type: med.type, image: med.image, ...(med.thumb ? { thumb: med.thumb } : {}), ...(med.frame ? { frame: med.frame } : {}), auto: true, cascade: true, quality: q, checked_at: new Date(now).toISOString() };
        delete h.media_context; delete h.alt_media; delete h.caption;
        cs.best_q = cur = q; curTier = ct;
        if (ct === 1) { h.media_locked = true; h.text_locked = true; res.locked = [...(res.locked || []), h.id]; log(`cascade LOCK: ${h.id} — SpaceX's own post, no more media or wording changes`); }
        if (/^images\//.test(med.image)) res.files.push(med.image);
        res.swapped.push(`${h.id} ← @${handleOf(p)} ${p.post_id}`); log(`cascade SWAP (no push): ${h.id} ← @${handleOf(p)} ${p.url}`);
      }
    }
  }
  return res;
}
module.exports = { climbTier, SAME_EVENT_H, LIT_MIN, tierOf, sameEvent, eventOfText, quality, runCascade, defaultFrameFor };
