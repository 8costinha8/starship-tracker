// Proves scripts/run-tests.js never spawns test-push.js / send-oneoff.js / a push-send name,
// even when those files are explicitly listed in tests/suites.json. Uses a temp tree and
// canary stand-ins (not the live scripts/test-push.js). No network, no secrets, nothing is sent.
const fs = require("fs"), os = require("os"), path = require("path"), { spawnSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
const CANARY = `const fs=require("fs"); fs.writeFileSync(process.env.CANARY, process.argv[1] + " RAN\\n", {flag:"a"}); console.log("✅ I should never run");`;
const SAFE = `console.log("✅ safe test ran");`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rts-"));
const marker = path.join(dir, "CANARY");
fs.mkdirSync(path.join(dir, "scripts"));
fs.mkdirSync(path.join(dir, "tests"));
fs.copyFileSync(path.join(ROOT, "scripts", "run-tests.js"), path.join(dir, "scripts", "run-tests.js"));
fs.writeFileSync(path.join(dir, "scripts", "test-ok.js"), SAFE);
fs.writeFileSync(path.join(dir, "scripts", "test-push.js"), CANARY);
fs.writeFileSync(path.join(dir, "scripts", "send-oneoff.js"), CANARY);
fs.writeFileSync(path.join(dir, "scripts", "push-send-now.js"), CANARY);
// listed on purpose: the runner must still refuse them
const suites = {
  _note: "safety canary",
  logic: ["scripts/test-ok.js", "scripts/test-push.js", "scripts/send-oneoff.js", "scripts/push-send-now.js"],
  frozen: {}, broken: [], manual: []
};
fs.writeFileSync(path.join(dir, "tests", "suites.json"), JSON.stringify(suites, null, 2));
const env = { ...process.env, CANARY: marker, PUSH_SHADOW: "0" };
for (const k of Object.keys(env)) if (/^(FIREBASE|GOOGLE|FCM)/.test(k)) delete env[k];
const r = spawnSync(process.execPath, ["scripts/run-tests.js", "--offline", "--suite", "logic", "--jobs", "1"], {
  cwd: dir, env, encoding: "utf8", timeout: 20000
});
const out = `${r.stdout || ""}\n${r.stderr || ""}`;
const ran = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "";
ok(!ran.includes("test-push.js"), `test-push.js was not spawned even though it was listed${ran.includes("test-push.js") ? " (CANARY FIRED)" : ""}`);
ok(!ran.includes("send-oneoff.js"), "send-oneoff.js was not spawned even though it was listed");
ok(!ran.includes("push-send-now.js"), "push-send-now.js (/push-send/) was not spawned even though it was listed");
ok(/REFUSED\s+scripts\/test-push\.js/.test(out), "runner prints REFUSED for scripts/test-push.js");
ok(/REFUSED\s+scripts\/send-oneoff\.js/.test(out), "runner prints REFUSED for scripts/send-oneoff.js");
ok(/REFUSED\s+scripts\/push-send-now\.js/.test(out), "runner prints REFUSED for scripts/push-send-now.js");
ok(/TOTAL: 1\/1 test files pass/.test(out) && r.status === 0, `safe listed test still runs (status ${r.status}; out has TOTAL line: ${/TOTAL:.*/.test(out)})`);
ok(!/I should never run/.test(out), "canary body never printed");
try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
