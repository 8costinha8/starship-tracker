/* Road history cap (9 Nov 2026, approved by Tusk: the NARROW version).
   Each Road box keeps a rolling history of its newest posts. Before this, both writers cut the list to the newest 12, so
   busy boxes deleted posts behind agreed Flight Log lines (road.flightlog_pins) and render-check then flagged a mismatch.
   capHistory(box, limit, road) protects:
     - rows whose url matches a road.flightlog_pins line for the current flight
     - rows flagged refiled_pin or journey_pin
   It trims only unprotected rows, oldest first, keeping the newest `limit` of them (LIMITS.historyPerBox = 12 in
   check-road.js), then sorts newest first with sortHistory. Pure data: no push, feed item or notification.
   Used by x-first.js placePost() and check-road.js applyUpdates(). Test: node scripts/test-historycap.js */
const isCheckRow = (h) => !!h && h.kind === "check";
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
      if (isCheckRow(a.h) !== isCheckRow(b.h)) return isCheckRow(a.h) ? 1 : -1; // same day: real news wins
      if (a.h.at && b.h.at && a.h.at !== b.h.at) return String(b.h.at).localeCompare(String(a.h.at));
      return a.i - b.i;
    })
    .map((x) => x.h);
}

const normUrl = (u) => String(u || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?(twitter|x)\.com\//i, "https://x.com/");
function pinnedUrls(road) {
  const fp = road && road.flightlog_pins;
  if (!fp || !fp.boxes || Number(fp.flight) !== Number(road.flight)) return new Set();
  const out = new Set();
  for (const b of Object.values(fp.boxes)) for (const k of (b && b.cards) || []) for (const l of k.lines || []) if (l && l.url) out.add(normUrl(l.url));
  return out;
}
function isProtected(h, pins) { return !!h && (!!h.refiled_pin || !!h.journey_pin || (!!h.url && pins.has(normUrl(h.url)))); }
function capHistory(box, limit, road, now = new Date()) {
  const pins = pinnedUrls(road), sorted = sortHistory(box.history || [], now);
  const keep = new Set(sorted.filter((h) => !isProtected(h, pins)).slice(0, Math.max(0, Number(limit) || 0)));
  box.history = sorted.filter((h) => isProtected(h, pins) || keep.has(h));
  return box.history;
}

module.exports = { MONTHS, londonDayKey, historyDayKey, sortHistory, capHistory, pinnedUrls, isProtected };
