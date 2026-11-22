/* Stale-data self-alarm, checker side (batch 1 / P2). Pure. app.js carries an identical copy of dataStaleness() between the
   <stale-fn> markers (test-freshness.js proves the two agree on every case below). No push is ever sent from here.
   Input: data/health.json. health.updated is rewritten by whichever script commits (about hourly), so a healthy checker shows age 0-65 min.
   Verified on the live file 22 Nov: check-flights "at" lagged check-road by 2 h while both were fine, so per-script ages are NOT used. */
const LATE_MIN = 100, STALE_MIN = 180;
function dataStaleness(h, now) {
  if (!h || !h.updated || !Number.isFinite(Date.parse(h.updated))) return { level: "unknown", stale: false, ageMin: null, why: "" };
  const ageMin = Math.max(0, Math.round((now - Date.parse(h.updated)) / 60000));
  const ll2 = h.sources && h.sources.ll2;
  const ll2Down = !!(ll2 && ll2.status === "failed" && ll2.last_ok && now - Date.parse(ll2.last_ok) > 180 * 60000);
  if (ageMin > 180) return { level: "stale", stale: true, ageMin, why: "no checker run has been recorded" };
  if (ll2Down) return { level: "stale", stale: true, ageMin, why: "launch times could not be refreshed" };
  if (ageMin > 100) return { level: "late", stale: false, ageMin, why: "checker is late" };
  return { level: "ok", stale: false, ageMin, why: "" };
}
module.exports = { dataStaleness, LATE_MIN, STALE_MIN };
