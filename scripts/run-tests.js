// Test runner: node scripts/run-tests.js [--suite default|logic|frozen|broken|all] [--offline] [--json out.json] [--jobs N]
// Execution list is ONLY the files named in tests/suites.json (an allowlist). There is no glob discovery
// for execution: a test-*.js file that is not listed is never started.
// Hard block: scripts/test-push.js, scripts/send-oneoff.js, and any path matching /push-send/ or the
// exact file name test-push.js are NEVER spawned, even if they are listed in suites.json.
// (test-push-tiers, test-push-policy, test-push-gate, test-push-sync are different files and stay allowed.)
// Every test file is a child process (network blocked with `unshare -rn` when --offline and available; no secrets in the env).
// Exit code 1 if any test in a selected suite fails or crashes. A test file that prints no result at all counts as FAILED (not skipped).
const fs = require("fs"), path = require("path"), { spawn, spawnSync } = require("child_process");
const ROOT = path.join(__dirname, ".."), arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const suiteSel = arg("--suite", "default"), jobs = Number(arg("--jobs", 4)), outJson = arg("--json", null), offline = process.argv.includes("--offline");
const defs = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "suites.json"), "utf8"));
const listOf = (s) => s === "frozen" ? Object.keys(defs.frozen || {}) : [...(defs[s] || [])];
const listed = [...new Set([...listOf("logic"), ...listOf("frozen"), ...listOf("broken"), ...listOf("manual")])];
// Forbidden names: the live scripts/test-push.js sends real FCM if credentials are present. Never start it.
// A literal /test-push/ would also match test-push-tiers.js (and test-push-policy/gate/sync), which must run.
function forbidden(f) {
  const n = String(f).replace(/\\/g, "/");
  const base = path.basename(n);
  if (base === "test-push.js" || base === "send-oneoff.js") return true;
  if (/push-send/.test(n)) return true;
  if (/(?:^|\/)test-push(?:\.js)?$/.test(n)) return true;
  return false;
}
const wanted = suiteSel === "all" ? listed.filter((f) => !listOf("manual").includes(f))
  : suiteSel === "default" ? [...listOf("logic"), ...listOf("frozen")]
  : listOf(suiteSel);
const refused = wanted.filter(forbidden);
const missing = wanted.filter((f) => !forbidden(f) && !fs.existsSync(path.join(ROOT, f)));
const todo = wanted.filter((f) => !forbidden(f) && fs.existsSync(path.join(ROOT, f)));
if (!process.argv.includes("--list")) {
  for (const f of refused) console.log(`REFUSED  ${f}  (blocked name: never spawned)`);
  for (const f of missing) console.log(`MISSING  ${f}  (listed in tests/suites.json but not on disk)`);
}
if (process.argv.includes("--list")) {
  console.log(`suite: ${suiteSel}`);
  for (const f of refused) console.log(`REFUSED  ${f}  (blocked name: never spawned)`);
  for (const f of missing) console.log(`MISSING  ${f}`);
  for (const f of todo) console.log(`RUN      ${f}`);
  process.exit(missing.length ? 1 : 0);
}
const canUnshare = offline && spawnSync("unshare", ["-rn", "true"]).status === 0;
if (offline && !canUnshare) console.log("(unshare not available: tests run with network access)");
const env = { ...process.env, PUSH_SHADOW: "0", TZ: "UTC" };
for (const k of Object.keys(env)) {
  if (/^(FIREBASE|GOOGLE|FCM)/.test(k) || /^(FIREBASE_SERVICE_ACCOUNT|XAI_API_KEY|ANTHROPIC_API_KEY|X_BEARER_TOKEN|GITHUB_TOKEN|FCM_TOKEN)$/.test(k)) delete env[k];
}
const HISTORY = arg("--history", fs.existsSync(path.join(ROOT, ".git")) ? ROOT : null) || (fs.existsSync("/workspace/tusk/pipeline-review/repo/.git") ? "/workspace/tusk/pipeline-review/repo" : null);
const DATA = ["road.json", "road-media.json", "notifications.json", "push-shadow.json", "data/health.json", "data/needs-review.json", "review-queue.json"];
function frozenTree(sha) {
  const t = fs.mkdtempSync(path.join(require("os").tmpdir(), "frozen-")); fs.cpSync(ROOT, t, { recursive: true, filter: (s) => !/[\/](\.git|node_modules)([\\/]|$)/.test(s) });
  for (const fn of DATA) { const r = spawnSync("git", ["show", `${sha}:${fn}`], { cwd: HISTORY, maxBuffer: 1e9 }); if (r.status === 0) { fs.mkdirSync(path.dirname(path.join(t, fn)), { recursive: true }); fs.writeFileSync(path.join(t, fn), r.stdout); } }
  return t;
}
const results = []; let i = 0;
const count = (txt) => ({ ok: (txt.match(/^\s*(?:✅|✓)/gm) || []).length, bad: (txt.match(/^\s*(?:❌|✗)/gm) || []).length });
const suiteOf = (f) => (defs.manual || []).includes(f) ? "manual" : (defs.broken || []).includes(f) ? "broken" : (defs.frozen || {})[f] ? "frozen" : "logic";
function one(f) { return new Promise((res) => {
  if (forbidden(f)) { results.push({ file: f, suite: suiteOf(f), status: "REFUSED", ok: 0, bad: 0, ms: 0, tail: "blocked name: never spawned" }); return res(); }
  const t0 = Date.now(), cmd = canUnshare ? "unshare" : process.execPath, args = canUnshare ? ["-rn", process.execPath, f] : [f];
  let cwd = ROOT, tmp = null;
  if (suiteOf(f) === "frozen") { if (!HISTORY) return res(results.push({ file: f, suite: "frozen", status: "NO-HISTORY", ok: 0, bad: 0, ms: 0, tail: "needs git history (--history <clone>)" })); tmp = cwd = frozenTree(defs.frozen[f]); }
  const p = spawn(cmd, args, { cwd, env }); let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
  const to = setTimeout(() => p.kill("SIGKILL"), 120000);
  p.on("close", (code, sig) => { clearTimeout(to); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); const c = count(out); const status = sig ? "TIMEOUT" : code !== 0 ? "FAIL" : (c.ok + c.bad === 0 && !/pass|ok|all good|✅/i.test(out)) ? "NO-RESULT" : c.bad ? "FAIL" : "PASS";
    results.push({ file: f, suite: suiteOf(f), status, ok: c.ok, bad: c.bad, ms: Date.now() - t0, tail: out.trim().split("\n").slice(-3).join(" ⏎ ").slice(0, 300) }); res(); }); }); }
(async () => {
  await Promise.all(Array.from({ length: jobs }, async () => { while (i < todo.length) await one(todo[i++]); }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  for (const s of ["logic", "frozen", "broken"]) { const r = results.filter((x) => x.suite === s); if (!r.length) continue;
    console.log(`\n── suite: ${s} — ${r.filter((x) => x.status === "PASS").length}/${r.length} files pass · ${r.reduce((a, x) => a + x.ok, 0)} checks ✅ / ${r.reduce((a, x) => a + x.bad, 0)} ❌`);
    for (const x of r) if (x.status !== "PASS") console.log(`  ${x.status.padEnd(9)} ${x.file}  (${x.ok}✅ ${x.bad}❌)  ${x.tail.slice(0, 140)}`); }
  const failed = results.filter((x) => x.status !== "PASS");
  console.log(`\nTOTAL: ${results.length - failed.length}/${results.length} test files pass (${suiteSel}); refused (never spawned): ${refused.length}; missing: ${missing.length}; listed, not run: ${listed.filter((f) => !wanted.includes(f)).length}`);
  if (outJson) fs.writeFileSync(outJson, JSON.stringify({ at: new Date().toISOString(), suite: suiteSel, results, refused, missing }, null, 2));
  // refused files are a successful block, not a failure; missing listed files are a failure
  const failN = failed.length + missing.length;
  process.exit(failN ? 1 : 0);
})();
