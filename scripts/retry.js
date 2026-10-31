/* Retry for flaky fetches (X, news, images): up to 2 retries with short backoff (0.5 s, 1.5 s) on a network error,
   HTTP 429 or 5xx. 4xx answers (404 etc.) are returned as-is (not retried). */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function withRetry(fetchFn, { retries = 2, backoff = [500, 1500], log = () => {}, wait = sleep } = {}) {
  if (!fetchFn || fetchFn.__retry) return fetchFn;
  const f = async (...args) => {
    let last;
    for (let i = 0; i <= retries; i++) {
      try { const r = await fetchFn(...args); if (r && (r.status === 429 || r.status >= 500) && i < retries) { last = new Error(`HTTP ${r.status}`); } else return r; }
      catch (e) { last = e; if (i >= retries) throw e; }
      log(`retry ${i + 1}/${retries} ${String(args[0]).slice(0, 80)}: ${last.message}`); await wait(backoff[i] || backoff[backoff.length - 1]);
    }
    throw last;
  };
  f.__retry = true; return f;
}
module.exports = { withRetry };
