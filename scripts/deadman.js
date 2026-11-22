/* Dead-man's switch pieces that live in the repo (batch 1 / P2). Pure helpers + one optional external ping. No sending of user pushes, ever.
   1. gapInfo: the NEXT run notices that earlier 15-min runs never happened (GitHub delays or drops scheduled runs; skipped runs record nothing in health.json).
      The previous run's time is kept in the checker's own state (Firestore app-state/next-flight.checkedAt, written every run), NOT in health.json,
      which is only committed about once an hour.
   2. ping: optional prospective alarm. If HEALTHCHECK_URL is set (a Healthchecks.io-style URL; needs a repo secret + a workflow env line, so it is a
      written proposal, not wired), one GET at the end of a successful run; the service alerts when pings stop. Inert without the env var. */
const EXPECTED_MIN = 15;
function gapInfo(prevIso, nowMs, { expectedMin = EXPECTED_MIN, tolerateMin = 45 } = {}) {
  const t = Date.parse(prevIso);
  if (!Number.isFinite(t) || !Number.isFinite(nowMs) || nowMs < t) return { gapMin: null, missed: 0, level: "unknown" };
  const gapMin = Math.round((nowMs - t) / 60000);
  const missed = gapMin > tolerateMin ? Math.max(0, Math.round(gapMin / expectedMin) - 1) : 0;
  return { gapMin, missed, level: gapMin <= tolerateMin ? "ok" : gapMin <= 180 ? "late" : "dead" };
}
async function ping(url, { fetchFn = globalThis.fetch, log = console.log, kind = "" } = {}) {
  if (!url || !/^https:\/\//.test(String(url))) return { sent: false, why: "no HEALTHCHECK_URL" };
  try {
    const u = kind ? `${String(url).replace(/\/+$/, "")}/${kind}` : url;
    const r = await fetchFn(u, { method: "GET", signal: AbortSignal.timeout(8000), headers: { "user-agent": "StarshipTracker/1.0 healthcheck" } });
    return { sent: true, ok: !!(r && r.ok) };
  } catch (e) { log(`healthcheck ping failed (ignored): ${e.message}`); return { sent: false, why: e.message }; }
}
module.exports = { gapInfo, ping, EXPECTED_MIN };
