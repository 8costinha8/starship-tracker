/* Provider faults (HTTP 401/402/403, credit / quota / spending limit) fail the run on the FIRST occurrence unless the
   fallback provider wrote the cards (then: warning naming the failed provider). Other writer failures keep the 4-run
   threshold. Fake fetch + dummy keys only: no network, no secrets. */
process.env.WRITER = "grok"; process.env.XAI_API_KEY = "test-dummy-xai"; process.env.ANTHROPIC_API_KEY = "test-dummy-anthropic";
delete process.env.GITHUB_ACTIONS;
const writer = require("./writer.js"), wd = require("./watchdog.js");
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) fails++; };
const XAI_403 = { status: 403, body: { code: "Some resource has been exhausted", error: "Your team has either used all available credits or reached its monthly spending limit. To continue making API requests, please purchase more credits or raise your spending limit." } };
const ANT_CREDIT = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } } };
const ANT_OK = { status: 200, body: { content: [{ type: "text", text: '[{"card":"Ship 42 fired all 6 Raptors."}]' }], stop_reason: "end_turn", usage: {} } };
const XAI_401 = { status: 401, body: { error: "Incorrect API key provided: te***ai. You can obtain an API key from https://console.x.ai." } };
function fakeFetch(map) {
  global.fetch = async (url, init) => {
    const r = /x\.ai/.test(url) ? map.xai : map.ant;
    if (r === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    const raw = JSON.stringify(r.body);
    return { ok: r.status < 400, status: r.status, text: async () => raw, json: async () => JSON.parse(raw) };
  };
}
const quiet = { log: () => {}, attempts: 1, retryMs: 0 };
const run = async (map) => { writer.resetProviderFaults(); fakeFetch(map); let v = null, failed = false; try { v = await writer.askJson("p", quiet); } catch { failed = true; } return { v, failed, faults: writer.providerFaults() }; };
const watch = (r, state = {}) => { const alarms = wd.check(state, { terms: ["S42"], candidates: 5, writerFailed: r.failed, providerFaults: r.faults }); return { alarms, warnings: wd.check.warnings, state }; };

(async () => {
  console.log("── 403 from xAI, Anthropic OK ──");
  let r = await run({ xai: XAI_403, ant: ANT_OK }), w = watch(r);
  check(!r.failed && Array.isArray(r.v) && r.v[0].card === "Ship 42 fired all 6 Raptors.", "fell back to Anthropic, cards written");
  check(!w.alarms.length, "run passes (no alarm)");
  check(w.warnings.length === 1 && /^writer provider failure: xAI credits exhausted \(HTTP 403\)/.test(w.warnings[0]), `warning names xAI: "${w.warnings[0]}"`);

  console.log("── both providers out of credits ──");
  r = await run({ xai: XAI_403, ant: ANT_CREDIT }); w = watch(r);
  check(r.failed, "writer failed");
  check(w.alarms.length === 1 && /xAI credits exhausted \(HTTP 403\); Anthropic credit balance too low \(HTTP 400\)/.test(w.alarms[0]), `fails on the FIRST run naming both: "${w.alarms[0]}"`);
  check(w.state.watchdog.writerFailRuns === 0, "not counted toward the 4-run threshold (already alarmed)");

  console.log("── 401 auth error ──");
  r = await run({ xai: XAI_401, ant: ANT_CREDIT }); w = watch(r);
  check(w.alarms.length === 1 && /xAI authentication failed \(HTTP 401\)/.test(w.alarms[0]), `401 alarms immediately: "${w.alarms[0]}"`);
  check(!/te\*\*\*ai|test-dummy/.test(w.alarms.join(" ")), "no key fragment in the message");
  r = await run({ xai: XAI_401, ant: ANT_OK }); w = watch(r);
  check(!w.alarms.length && /xAI authentication failed \(HTTP 401\)/.test(w.warnings[0] || ""), "401 with Anthropic OK → warning only");

  console.log("── non-credit failure (timeout) keeps the 4-run threshold ──");
  const st = {};
  for (let i = 1; i <= 4; i++) {
    r = await run({ xai: "timeout", ant: "timeout" }); w = watch(r, st);
    check(r.failed && !r.faults.length, `run ${i}: writer failed, no provider fault`);
    check(i < 4 ? !w.alarms.length : w.alarms.length === 1 && /4 consecutive runs/.test(w.alarms[0]), i < 4 ? `run ${i}: no alarm yet` : `run 4: alarm "${w.alarms[0]}"`);
  }
  r = await run({ xai: "timeout", ant: ANT_OK }); w = watch(r, st);
  check(!w.alarms.length && !w.warnings.length && st.watchdog.writerFailRuns === 0, "timeout with Anthropic OK: no warning, counter reset");

  console.log("── classification ──");
  const pf = (p, status, message) => writer.providerFault(p, Object.assign(new Error(message), { status }));
  check(pf("grok", 402, "payment required").reason === "payment required (HTTP 402)", "402 → payment required");
  check(pf("claude", 429, "You exceeded your current quota").reason === "quota exceeded (HTTP 429)", "quota → quota exceeded");
  check(pf("grok", 429, "rate limited, slow down") === null, "plain rate limit is not a credit fault");
  check(pf("grok", 500, "server error") === null, "500 is not a provider fault");

  console.log(fails ? `\n❌ ${fails} check(s) failed.` : "\nAll provider-fault checks passed.");
  process.exit(fails ? 1 : 0);
})();
