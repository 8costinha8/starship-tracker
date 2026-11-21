// Deploy gate: run the validator on the working tree BEFORE a data commit, and refuse the commit when it
// introduces an error the last committed tree did not have (ratchet: old known errors do not freeze the bot).
//   gate.check({ root, files })          → { ok, skipped?, newErrors:[{id,msg}], existing }
//   gate.assertClean({ root, files, log }) → throws "GATE blocked …" only when PIPELINE_GATE=block (nothing committed, nothing pushed)
// Env: PIPELINE_GATE=warn (DEFAULT: report, do not block) | block (explicit: throw before commit) | off (explicit bypass, logged). No network, no secrets.
const { spawnSync, execSync } = require("node:child_process");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

const GATED = /^(road\.json|app\.js|road-media\.json)$/;           // files whose write is user-visible
const TREE = ["app.js", "road.json", "road-media.json", "notifications.json", "index.html", "data/health.json", "data/needs-review.json", ".github/workflows/mission-alert.yml"];

function baselineFromGit(root) { // the last committed versions of the files the validator reads
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-base-"));
  for (const f of TREE) {
    try { const b = execSync(`git show HEAD:${f}`, { cwd: root, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64e6 });
      fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), b); } catch {}
  }
  return dir;
}

function check({ root, files = ["road.json"], baseline, now } = {}) {
  if (!files.some((f) => GATED.test(path.basename(f)) && !f.includes("/"))) return { ok: true, skipped: "no gated file in this commit", newErrors: [] };
  const base = baseline || baselineFromGit(root);
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gate-out-")), "r.json");
  const args = [path.join(__dirname, "validate.mjs"), "--dir", root, "--repo", root, "--offline", "--no-images", "--ratchet", base, "--json", out];
  if (now) args.push("--now", now);
  const r = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 60000 });
  let res; try { res = JSON.parse(fs.readFileSync(out, "utf8")); } catch { res = null; }
  if (!res) { // the validator itself crashed: block only when a data file is not even valid JSON; a validator bug must never freeze the bot
    const bad = ["road.json", "road-media.json"].filter((f) => { try { JSON.parse(fs.readFileSync(path.join(root, f), "utf8")); return false; } catch (e) { return fs.existsSync(path.join(root, f)); } });
    if (bad.length) return { ok: false, newErrors: bad.map((f) => ({ id: "A0-json", msg: `${f} is not valid JSON` })), advisory: [], existing: 0 };
    return { ok: true, crashed: true, newErrors: [], advisory: [{ id: "GATE-crash", msg: `validator did not finish (exit ${r.status}) — not blocking: ${String(r.stderr || "").slice(0, 160)}` }], existing: 0 };
  }
  return { ok: !res.new.length, newErrors: res.new.map((f) => ({ id: f.id, msg: f.msg })), advisory: (res.advisory || []).map((f) => ({ id: f.id, msg: f.msg })), existing: res.existing };
}

function assertClean({ root, files, log = console.log, baseline, now }) {
  const mode = process.env.PIPELINE_GATE || "warn";
  if (mode === "off") { log("::warning::Deploy gate bypassed (PIPELINE_GATE=off)"); return { ok: true, bypassed: true }; }
  const r = check({ root, files, baseline, now });
  if (r.skipped) return r;
  for (const a of r.advisory || []) log(`::warning::Deploy gate advisory [${a.id}] ${a.msg}`);
  if (r.ok) { log(`Deploy gate: ok (${r.existing} known error(s) unchanged, 0 new blocking, ${(r.advisory || []).length} advisory)`); return r; }
  const lines = r.newErrors.map((e) => `  [${e.id}] ${e.msg}`).join("\n");
  log(`::error::Deploy gate: ${r.newErrors.length} NEW validator error(s)\n${lines}`);
  if (mode === "warn") return { ...r, ok: true, warned: true };
  const err = new Error(`GATE blocked the commit: ${r.newErrors.map((e) => e.id).join(", ")}`); err.gate = r; throw err;
}

module.exports = { check, assertClean, baselineFromGit, GATED };
