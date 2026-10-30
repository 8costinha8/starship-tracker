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
/* Source faults (extension, 29 Oct): the X read failing (HTTP 401/402/403/429, or a credits/usage-cap error) alarms at
   the FIRST run — before, X-first only logged "tried again next run" while RSS candidates kept the zero-post counter at 0.
   Any other X-first failure (timeouts, 5xx) alarms after WATCHDOG_RUNS runs in a row. Alarm text never holds secrets. */
function sourceFault(msg) {
  const m = String(msg || ""), st = Number((m.match(/HTTP (\d{3})/) || [])[1]) || 0;
  if ([401, 402, 403, 429].includes(st) || /credits?|usage cap|quota|spending limit/i.test(m)) return `X read failed: ${st ? `HTTP ${st}` : "credits / quota"}`;
  return null;
}
function check(state, { terms = [], candidates = 0, writerFailed = false, providerFaults = [], xFailed = null, sourceQuery } = {}, n = WATCHDOG_RUNS) {
  const w = { ...(state.watchdog || {}) };
  const sf = xFailed ? sourceFault(xFailed) : null;
  w.xFailRuns = xFailed && !sf ? (w.xFailRuns || 0) + 1 : 0;
  w.zeroRuns = candidates > 0 ? 0 : (w.zeroRuns || 0) + 1;
  const pc = providerCheck(providerFaults, writerFailed);
  // the 4-run threshold is only for other writer failures (timeouts, bad replies); a provider fault already alarmed
  w.writerFailRuns = writerFailed && !providerFaults.length ? (w.writerFailRuns || 0) + 1 : 0;
  const alarms = [...pc.alarms];
  // ONE source list (sources.js): warn if the list is malformed or the live X search stops covering it
  let sq = sourceQuery; if (sq === undefined) { try { sq = require("./x-first.js").xfQuery(); } catch { sq = null; } }
  check.warnings = [...pc.warnings, ...require("./sources.js").audit(sq)];
  if (!terms || !terms.length) alarms.push("search terms are empty (vehicle derivation and static fallback both empty)");
  if (w.zeroRuns >= n) alarms.push(`zero candidate posts fetched for ${w.zeroRuns} consecutive runs`);
  if (sf) alarms.push(`${sf} — the checker is blind to X (check the X API plan / bearer token)`);
  if (w.xFailRuns >= n) alarms.push(`X-first failed for ${w.xFailRuns} consecutive runs`);
  if (w.writerFailRuns >= n) alarms.push(`LLM writer failed for ${w.writerFailRuns} consecutive runs (check xAI credits) — posts are piling up unclassified`);
  state.watchdog = w;
  return alarms;
}
module.exports = { sourceFault, check, providerCheck, fmtFault, WATCHDOG_RUNS };
