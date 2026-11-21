// Replays the gate over real history: for each commit that touched road.json/app.js, validate the tree at that
// commit with the baseline = its parent (exactly what the gate would have seen), --now = the commit time. Read-only.
// node scripts/backtest-gate.js <repo> <since> <out.tsv>
const { execSync, spawnSync } = require("child_process"), fs = require("fs"), os = require("os"), path = require("path");
const [repo, since, outFile] = process.argv.slice(2);
const sh = (c, o = {}) => execSync(c, { cwd: repo, encoding: "utf8", maxBuffer: 1e9, ...o });
const shas = sh(`git log --since="${since}" --reverse --format="%H|%cI|%an|%s" -- road.json app.js`).trim().split("\n").map((l) => l.split("|"));
const extract = (sha) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "bt-")); execSync(`git archive ${sha} app.js road.json road-media.json notifications.json index.html data scripts .github 2>/dev/null | tar -x -C ${d}`, { cwd: repo, shell: "/bin/bash", stdio: "pipe" }); return d; };
const out = ["sha\tat\tauthor\tsubject\tblocked\tnew_errors"]; let blocked = 0, n = 0;
for (const [sha, at, author, ...subj] of shas) {
  let cur, base; try { cur = extract(sha); base = extract(sha + "~1"); } catch { continue; }
  const o = path.join(cur, "gate.json");
  const r = spawnSync(process.execPath, [path.join(__dirname, "validate.mjs"), "--dir", cur, "--repo", cur, "--offline", "--no-images", "--ratchet", base, "--now", at, "--json", o], { encoding: "utf8", timeout: 90000 });
  let res = null; try { res = JSON.parse(fs.readFileSync(o, "utf8")); } catch {}
  const ne = res ? res.new.map((f) => `${f.id}: ${String(f.msg).slice(0, 110)}`) : ["VALIDATOR-CRASH"];
  n++; if (ne.length) blocked++;
  out.push([sha.slice(0, 7), at, author, subj.join("|").slice(0, 80), ne.length ? "BLOCK" : "ok", ne.join(" ‖ ")].join("\t"));
  fs.rmSync(cur, { recursive: true, force: true }); fs.rmSync(base, { recursive: true, force: true });
}
fs.writeFileSync(outFile, out.join("\n") + "\n");
console.log(`${n} commits replayed, ${blocked} would have been blocked`);
