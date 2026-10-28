/* Run health watchdog (inside the scripts, no workflow edit): fails the run LOUDLY (exit 1 → red run + GitHub email)
   when the checker is silently blind:
   - search terms empty (vehicle derivation failed even after the static fallback), immediately;
   - zero candidate posts fetched (X-first read + X search + feeds) for WATCHDOG_RUNS consecutive runs;
   - the LLM writer (Grok AND Claude fallback) failed for WATCHDOG_RUNS consecutive runs — the 26–28 Oct outage:
     both providers out of credits, posts "retried next run" forever, the run still green. */
const WATCHDOG_RUNS = 4; // 4 × 15 min = 1 h
function check(state, { terms = [], candidates = 0, writerFailed = false } = {}, n = WATCHDOG_RUNS) {
  const w = { ...(state.watchdog || {}) };
  w.zeroRuns = candidates > 0 ? 0 : (w.zeroRuns || 0) + 1;
  w.writerFailRuns = writerFailed ? (w.writerFailRuns || 0) + 1 : 0;
  const alarms = [];
  if (!terms || !terms.length) alarms.push("search terms are empty (vehicle derivation and static fallback both empty)");
  if (w.zeroRuns >= n) alarms.push(`zero candidate posts fetched for ${w.zeroRuns} consecutive runs`);
  if (w.writerFailRuns >= n) alarms.push(`LLM writer failed for ${w.writerFailRuns} consecutive runs (check xAI / Anthropic credits) — posts are piling up unclassified`);
  state.watchdog = w;
  return alarms;
}
module.exports = { check, WATCHDOG_RUNS };
