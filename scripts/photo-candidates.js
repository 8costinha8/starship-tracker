/* Photo upgrades are PROPOSALS only (24 Nov, Bernardo via Tusk): no automatic picture swap anywhere, at any confidence.
   media-watch, media-cascade and best-frame return candidates; every candidate that passes the photo gate (photo-gate.js)
   is listed in data/needs-review.json as { type: "photo_candidate", card_id, image_url, post_url, reason, confidence, gate },
   one per card_id + image_url. The card keeps its current picture (or placeholder) until a manual pick is relayed. */
const fs = require("fs"), path = require("path");
const G = require("./photo-gate.js");
function candidate({ card_id, image_url, post_url, reason, confidence = null, score = null, quality = null, source = null, author = null, type = null, post_text = "", frame = null, stats = null }) {
  const gate = G.localCheck({ image: image_url, type, author, post_text, stats });
  return { type: "photo_candidate", card_id: card_id || null, image_url: image_url || null, post_url: post_url || null, reason: reason || "", confidence: Number.isFinite(confidence) ? confidence : null,
    gate: { ok: gate.ok, reasons: gate.reasons, ...(score != null ? { score } : {}), ...(quality != null ? { quality } : {}), ...(stats ? { stats } : {}) }, ...(source ? { source } : {}), ...(author ? { author } : {}), ...(frame ? { frame } : {}) };
}
// Only gate-passing candidates are queued. Returns the number added (deduped on card_id + image_url).
function writeCandidates(file, cands, now = Date.now()) {
  const ok = (cands || []).filter((c) => c && c.gate && c.gate.ok && c.image_url);
  if (!ok.length) return 0;
  let q = { items: [] }; try { q = JSON.parse(fs.readFileSync(file, "utf8")); if (!Array.isArray(q.items)) q = { ...q, items: [] }; } catch {}
  const have = new Set(q.items.filter((x) => x && x.type === "photo_candidate").map((x) => `${x.card_id}|${x.image_url}`)); let added = 0;
  for (const c of ok) { const k = `${c.card_id}|${c.image_url}`; if (have.has(k)) continue; have.add(k); added++;
    q.items.unshift({ date: new Date(now).toISOString(), ...c, item: c.card_id, values: [c.image_url], sources: c.post_url ? [c.post_url] : [], reason: c.reason, msg: `photo_candidate ${c.card_id}: ${c.image_url}` }); }
  q.items = q.items.slice(0, 300);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(q, null, 2) + "\n");
  return added;
}
module.exports = { candidate, writeCandidates };
