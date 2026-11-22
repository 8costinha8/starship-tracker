/* Supersession / compaction (batch 1, Bernardo 22 Nov 09:51: "a minimal app, not overpopulated"). Pure data step, no network, nothing sent.
   When newer information replaces older, the older item is FLAGGED, never deleted (history stays in road.json):
     hidden: true, superseded_by: <id>, why: <rule>      → the app may skip it (the app-side filter is a separate, later change; until then nothing is hidden)
   Rules (feed_items, per flight):
     S1  launch date / time pushes ("Launch delayed", "Launch time confirmed", "New estimated date/time"): only the newest stays visible
     S2  "Livestream ready" reminders: only the newest stays visible
     S3  an older status push of the same kind ("Flight update") is replaced by the newer
     C1  max visible NEWS items per flight: MAX_NEWS_VISIBLE (older ones: hidden, why "cap")
     C2  the feed list itself is capped at FEED_KEEP; the overflow moves to road.feed_archive (cap ARCHIVE_KEEP), it is not thrown away
   Length: capText(s, 90) cuts at a word boundary with an ellipsis (display only; the full text stays in the data field). */
const MAX_NEWS_VISIBLE = 12, ARCHIVE_KEEP = 500, FEED_KEEP = 40;
const DATE_KIND = /^\W*(?:Launch delayed|Launch time confirmed|New estimated (?:date|time))\b/i;
const STREAM = /^\W*Livestream ready\b/i;
const STATUS = /^\W*Flight update\b/i;
const kindOf = (f) => (DATE_KIND.test(f.title || "") ? "date" : STREAM.test(f.title || "") ? "stream" : STATUS.test(f.title || "") && f.kind === "flight" ? "status" : f.kind === "news" ? "news" : "other");
function capText(s, max = 90) { s = String(s || ""); if (s.length <= max) return s; const cut = s.slice(0, max - 1); return cut.replace(/\s+\S*$/, "").replace(/[,;:.\-–—]+$/, "") + "…"; }
function compactFeed(road, { maxNews = MAX_NEWS_VISIBLE } = {}) {
  const items = Array.isArray(road.feed_items) ? road.feed_items : [], changes = [];
  const byFlight = new Map();
  for (const f of items) { const k = f.flight == null ? "none" : f.flight; (byFlight.get(k) || byFlight.set(k, []).get(k)).push(f); }
  const hide = (f, by, why) => { if (f.hidden && f.superseded_by === (by && by.id) && f.why === why) return; f.hidden = true; if (by) f.superseded_by = by.id; f.why = why; changes.push({ id: f.id, why, by: by && by.id }); };
  for (const list of byFlight.values()) {
    const newestFirst = [...list].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    for (const kind of ["date", "stream", "status"]) {
      const same = newestFirst.filter((f) => kindOf(f) === kind);
      same.slice(1).forEach((f) => hide(f, same[0], { date: "S1 newer date replaces it", stream: "S2 newer reminder replaces it", status: "S3 newer status replaces it" }[kind]));
      if (same[0] && same[0].hidden) { delete same[0].hidden; delete same[0].superseded_by; delete same[0].why; } // the newest is always visible
    }
    newestFirst.filter((f) => kindOf(f) === "news" && !f.hidden).slice(maxNews).forEach((f) => hide(f, null, "C1 cap"));
  }
  return changes;
}
// C2: the overflow of the feed goes to road.feed_archive (used by push-sync.addFeedItem instead of a plain splice)
function archiveOverflow(road, keep = FEED_KEEP) {
  const list = road.feed_items || [], over = list.splice(keep);
  if (over.length) { const have = new Set((road.feed_archive || []).map((x) => x.id)); road.feed_archive = [...over.filter((x) => !have.has(x.id)), ...(road.feed_archive || [])].slice(0, ARCHIVE_KEEP); }
  return over.length;
}
module.exports = { compactFeed, archiveOverflow, capText, kindOf, MAX_NEWS_VISIBLE, ARCHIVE_KEEP };
