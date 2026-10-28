/* Run health watchdog (inside the scripts, no workflow edit): fails the run LOUDLY (exit 1 → red run + GitHub email)
   when the checker is silently blind:
   - search terms empty (vehicle derivation failed even after the static fallback), immediately;
   - zero candidate posts fetched (X-first read + X search + feeds) for WATCHDOG_RUNS consecutive runs;
   - the LLM writer (xAI Grok, the only model) failed for WATCHDOG_RUNS consecutive runs — like the 26–28 Oct outage:
     out of credits, posts "retried next run" forever, the run still green. */
const WATCHDOG_RUNS = 4; // 4 × 15 min = 1 h
/* Provider faults (writer.providerFaults(): HTTP 401/402/403 or a credit / quota / spending-limit error) act on the
   FIRST occurrence: if the writer failed the run fails now (no 4-run wait); if a later retry still wrote the cards
   the run passes with a warning naming the fault. */
const fmtFault = (f) => `${f.provider} ${f.reason}`;
function providerCheck(faults = [], writerFailed = false) {
  if (!faults.length) return { alarms: [], warnings: [] };
  const what = faults.map(fmtFault).join("; ");
  if (writerFailed) return { alarms: [`writer provider failure: ${what} — no writer available, posts left unclassified`], warnings: [] };
  return { alarms: [], warnings: [`writer provider failure: ${what} — cards still written this run`] };
}
function check(state, { terms = [], candidates = 0, writerFailed = false, providerFaults = [] } = {}, n = WATCHDOG_RUNS) {
  const w = { ...(state.watchdog || {}) };
  w.zeroRuns = candidates > 0 ? 0 : (w.zeroRuns || 0) + 1;
  const pc = providerCheck(providerFaults, writerFailed);
  // the 4-run threshold is only for other writer failures (timeouts, bad replies); a provider fault already alarmed
  w.writerFailRuns = writerFailed && !providerFaults.length ? (w.writerFailRuns || 0) + 1 : 0;
  const alarms = [...pc.alarms];
  check.warnings = pc.warnings;
  if (!terms || !terms.length) alarms.push("search terms are empty (vehicle derivation and static fallback both empty)");
  if (w.zeroRuns >= n) alarms.push(`zero candidate posts fetched for ${w.zeroRuns} consecutive runs`);
  if (w.writerFailRuns >= n) alarms.push(`LLM writer failed for ${w.writerFailRuns} consecutive runs (check xAI credits) — posts are piling up unclassified`);
  state.watchdog = w;
  return alarms;
}
module.exports = { check, providerCheck, fmtFault, WATCHDOG_RUNS };
