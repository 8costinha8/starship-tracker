/* Road to Flight card picture (app + Node). One card per vehicle per category; its picture comes from an EVENT:
   - incomplete card: the newest event (update) that has a picture;
   - completed card: the completing milestone's event.
   Several posts often report the same event (same vehicle + category + same happening): they form one group
   (same event kind as best-frame.js eventOf, within SAME_EVENT_H hours, like media-cascade.js sameEvent), and the
   BEST picture of the group wins: a manual pick (road-media.json keep_image) first, then source tier
   (config.js CASCADE_TIER1/2), then a real photo over a video thumbnail, then a curated local frame
   (images/…, from best-frame.js), then higher resolution when the post says, then the newest post.
   Earlier updates never carry pictures. Pure data: no fetch, no DOM. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.RoadPick = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const SAME_EVENT_H = 36;
  const TIER1 = ["spacex", "spacexstarship", "starbase", "elonmusk"];
  const TIER2 = ["nasaspaceflight", "labpadre", "rgvaerialphotos", "starbasesurfer", "csi_starbase", "blobifie", "trackingthesb", "starshipgazer", "efraser77", "colleenadastra", "starbasewatcher", "nicans", "zackgolden_"];
  const lc = (s) => String(s || "").toLowerCase().replace(/^@/, "");
  const tierOf = (h) => (TIER1.includes(lc(h)) ? 1 : TIER2.includes(lc(h)) ? 2 : 3);
  // same kinds as best-frame.js eventOf, plus engine work and pad work
  function kindOf(cid, text) {
    const t = String(text || "").toLowerCase();
    if (/static[- ]fire/.test(t) || (cid === "static" && !/roll|lift|transport|road|move|arriv|stand/.test(t))) return "static";
    if (/\bcatch|caught/.test(t)) return "catch";
    if (/lift(ed|ing)? (on|onto|to)|chopstick|stack/.test(t)) return "lift";
    if (/roll(s|ed|ing)? ?out|rollout|transport(ed)? to|headed (back )?to|arriv|returned to|left /.test(t)) return "move";
    if (/cryo|frost/.test(t)) return "cryo";
    if (/raptor|engine|rvac/.test(t)) return "engines";
    if (/bqd|deluge|launch mount|service structure|tower|pad/.test(t)) return "pad";
    return null;
  }
  const atOf = (e) => { for (const v of [e && e.completed_at, e && e.at, e && e.x_post && e.x_post.created_at, e && e.publishedAt]) if (v && Number.isFinite(Date.parse(v))) return Date.parse(v); return 0; };
  const handleOf = (e) => (e.media_override && e.media_override.author) || (e.x_post && e.x_post.author && e.x_post.author.username) || (/^@/.test(e.src || "") ? e.src : "");
  // every picture a post offers, with its score
  function picsOf(e) {
    const out = [], url = (e.media_override && e.media_override.post_url) || (e.x_post && e.x_post.url) || e.url || null;
    const mo = e.media_override;
    if (mo && mo.image) out.push({ image: mo.image, type: mo.type || "photo", post_url: mo.post_url || url, author: mo.author || handleOf(e), manual: !!mo.keep_image, w: 0 });
    for (const m of (e.x_post && e.x_post.media) || []) { const img = m.type === "photo" ? m.url : m.poster; if (img && !out.some((p) => p.image === img)) out.push({ image: img, type: m.type, post_url: url, author: handleOf(e), manual: false, w: m.width || 0 }); }
    return out;
  }
  const score = (p, e) => (p.manual ? 1000 : 0) + (4 - tierOf(p.author || handleOf(e))) * 10 + (p.type === "photo" ? 4 : 1) + (/^images\//.test(p.image) ? 2 : 0) + Math.min(2, (p.w || 0) / 1000);
  // entries: this card's posts (any order). anchor: the event to show (null → newest event with a picture).
  function groupOf(entries, cid, anchor) {
    const k = kindOf(cid, `${anchor.text || ""} ${anchor.x_text || ""}`), a = atOf(anchor);
    if (!k) return [anchor];
    return entries.filter((e) => e === anchor || (kindOf(cid, `${e.text || ""} ${e.x_text || ""}`) === k && Math.abs(atOf(e) - a) <= SAME_EVENT_H * 3600000));
  }
  function bestOf(group) {
    let best = null;
    group.forEach((e) => picsOf(e).forEach((p) => { const s = score(p, e); if (!best || s > best.s || (s === best.s && atOf(e) > atOf(best.e))) best = { s, p, e }; }));
    return best && { ...best.p, from: best.e };
  }
  function cardPicture(entries, { cid, done = null } = {}) {
    const list = entries.slice().sort((x, y) => atOf(y) - atOf(x));
    if (done) return bestOf(groupOf(list, cid, done));
    for (const e of list) { const b = bestOf(groupOf(list, cid, e)); if (b) return b; } // newest event that has any picture
    return null;
  }
  return { cardPicture, kindOf, groupOf, bestOf, tierOf, SAME_EVENT_H };
});
