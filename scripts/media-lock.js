/* Picture locks (24 Nov rule, Bernardo via Tusk): keep_image, or any other lock on a card picture (media_override.locked),
   may only come from a RECORDED manual pick by Bernardo in road-media.json (a pick whose note names Bernardo, or
   picked_by: "Bernardo"). Never from the automatic picker, a backfill or a render. Every script that writes road.json goes
   through sanitizeRoad() before saving (check-road.js), so a lock without that provenance is dropped on the next run.
   Not covered here: media_locked on a SpaceX-own post (media-cascade.js, the 29 Oct Tier 1 rule) is a source-tier rule,
   not a manual-pick flag. Pure: no network, no file writes. */
const bernardoPick = (p) => !!p && (String(p.picked_by || "").toLowerCase() === "bernardo" || /\bBernardo\b/.test(String(p.note || "")));
const LOCKS = ["keep_image", "locked"];
const idOf = (u) => (String(u || "").match(/status\/(\d+)/) || [])[1] || null;
// A pick list with every lock that lacks Bernardo provenance removed (the pick itself stays: it still chooses the picture).
function sanitizePicks(picks) {
  const out = [], dropped = [];
  for (const p of picks || []) {
    if (!p || bernardoPick(p) || !LOCKS.some((k) => p[k])) { out.push(p); continue; }
    const q = { ...p }; for (const k of LOCKS) delete q[k]; out.push(q);
    dropped.push({ category: p.category, date: p.date, post_id: p.post_id || idOf(p.post_url), image: p.image, flags: LOCKS.filter((k) => p[k]) });
  }
  return { picks: out, dropped };
}
// Does this card picture come from one of Bernardo's recorded picks (same image, or same post on the same card)?
function provenOf(h, cid, picks) {
  const mo = (h && h.media_override) || {};
  return (picks || []).find((p) => bernardoPick(p) && (p.image && p.image === mo.image || ((p.post_id || idOf(p.post_url)) && (p.post_id || idOf(p.post_url)) === (mo.post_id || idOf(mo.post_url)) && (!cid || p.category === cid)))) || null;
}
// Strip locks without provenance from every Road entry (current categories + archive entries). Returns what was removed.
function sanitizeRoad(road, picks) {
  const removed = [];
  const visit = (h, cid, where) => {
    const mo = h && h.media_override; if (!mo || typeof mo !== "object") return;
    const flags = LOCKS.filter((k) => mo[k]); if (!flags.length) return;
    if (h.id && require("./road-rules.js").PENDING.has(h.id)) return; // S43 Pad card: decision pending with Bernardo, untouched
    if (provenOf(h, cid, picks)) return;
    for (const k of flags) delete mo[k];
    removed.push({ where, cat: cid || null, id: h.id || null, image: mo.image || null, author: mo.author || null, flags });
  };
  for (const c of (road && road.categories) || []) for (const h of c.history || []) visit(h, c.id, "categories");
  for (const [n, a] of Object.entries((road && road.archive) || {})) for (const h of (a && a.entries) || []) visit(h, h.box || h.stage || null, `archive.${n}`);
  return removed;
}
module.exports = { bernardoPick, sanitizePicks, sanitizeRoad, provenOf, LOCKS };
