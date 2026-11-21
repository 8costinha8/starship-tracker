// Proves the deploy gate (scripts/gate.js + validate.mjs --ratchet).
//  1. strict run on the LIVE data (e538037): the validator finds the 15 live errors
//  2. a clean tree (live + the 3 sandbox fix patches + 4 small data fixes) has 0 errors
//  3. each of the 15 live errors, re-introduced into the clean tree, is DETECTED by the gate (ratchet vs clean): content errors BLOCK the commit, producer/infra ones are advisory
//  4. a broken FLIGHTS block / empty road.json / a harmless data change: broken ones blocked, harmless one passes
//  5. already-known errors do NOT freeze the bot (ratchet passes on the live tree vs itself)
//  6. default mode is WARN (no throw); PIPELINE_GATE=block throws "GATE blocked" before commit
// Self-contained: fixtures/gate-patches + fixtures/gate/mission-alert.yml ship with this test. No sandbox paths required.
const fs = require("fs"), os = require("os"), path = require("path"), { execSync, spawnSync } = require("child_process");
const gate = require("./gate.js");
const ROOT = path.join(__dirname, "..");
const NOW = "2026-11-21T18:30:00Z";
function firstExisting(cands) { return cands.filter(Boolean).find((p) => fs.existsSync(p)); }
// Self-contained: the 3 clean-tree patches and a copy of mission-alert.yml ship in fixtures/ so this test
// runs on the live repo without /workspace/tusk paths or a sibling patches/ directory.
const PATCHES = firstExisting([
  path.join(ROOT, "fixtures", "gate-patches"),
  process.env.PIPELINE_PATCHES,
  path.join(ROOT, "..", "patches"),
  "/workspace/tusk/sandbox/patches",
]);
const WORKFLOW = firstExisting([
  path.join(ROOT, ".github", "workflows", "mission-alert.yml"),
  path.join(ROOT, "fixtures", "gate", "mission-alert.yml"),
  process.env.LIVE_REPO && path.join(process.env.LIVE_REPO, ".github", "workflows", "mission-alert.yml"),
  "/workspace/tusk/pipeline-review/repo/.github/workflows/mission-alert.yml",
]);
let pass = 0, fail = 0; const rows = [];
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); return c; };
const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), `gt-${n}-`));
const FILES = ["app.js", "road.json", "road-media.json", "notifications.json", "index.html", "data/health.json", "data/needs-review.json"];
function snapshot(dest, from = ROOT) { for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true }); try { fs.copyFileSync(path.join(from, f), path.join(dest, f)); } catch {} }
  fs.cpSync(path.join(ROOT, "scripts"), path.join(dest, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(dest, ".github/workflows"), { recursive: true });
  if (!WORKFLOW) throw new Error("test-gate: no mission-alert.yml found (expected fixtures/gate/mission-alert.yml or .github/workflows/mission-alert.yml)");
  fs.copyFileSync(WORKFLOW, path.join(dest, ".github/workflows/mission-alert.yml")); return dest; }
const rd = (d, f) => fs.readFileSync(path.join(d, f), "utf8"), wr = (d, f, s) => fs.writeFileSync(path.join(d, f), s);
const jedit = (d, f, fn) => { const j = JSON.parse(rd(d, f)); fn(j); wr(d, f, JSON.stringify(j, null, 2) + "\n"); };
const feed = (j, id) => j.feed_items.find((x) => x.id === id);
const patch = (d, name, rev) => { if (!PATCHES) throw new Error("test-gate: clean-tree patches not found (expected fixtures/gate-patches/pipeline-photo-credit.patch)");
  const r = spawnSync("patch", ["-s", "-p1", ...(rev ? ["-R"] : []), "-i", path.join(PATCHES, `pipeline-${name}.patch`)], { cwd: d, encoding: "utf8" }); if (r.status) throw new Error(`patch ${name}: ${r.stdout}${r.stderr}`); };
const strict = (d) => { const o = path.join(tmp("o"), "r.json"); spawnSync(process.execPath, [path.join(__dirname, "validate.mjs"), "--dir", d, "--repo", ROOT, "--offline", "--no-images", "--now", NOW, "--json", o], { encoding: "utf8" });
  return JSON.parse(fs.readFileSync(o, "utf8")).findings.filter((f) => f.sev === "ERROR"); };
const ids = (a) => [...new Set(a.map((e) => e.id))].sort();

// 1) live
const live = snapshot(tmp("live"));
const liveErr = strict(live);
ok(liveErr.length === 15, `live data: validator finds ${liveErr.length} errors (expected 15): ${ids(liveErr).join(", ")}`);

// 2) clean tree
const clean = snapshot(tmp("clean"));
for (const p of ["photo-credit", "about-truth", "f16-data-fixes"]) patch(clean, p);
for (const id of ["news-mwctll4o-24a390", "news-mwctkn6g-276b89"]) jedit(clean, "road.json", (j) => { feed(j, id).src = id.endsWith("a390") ? "YouTube · Starship Flight 15 briefing" : "YouTube · Ship 42 rollout"; });
jedit(clean, "road.json", (j) => { for (const c of j.categories) for (const h of c.history) if (h.id === "x-2123269690457780726") h.flight = 16; });
jedit(clean, "data/health.json", (j) => { j.render_check.status = "ok"; j.render_check.failures = 0; });
wr(clean, ".github/workflows/mission-alert.yml", rd(clean, ".github/workflows/mission-alert.yml").split("\n").filter((l) => !/cron: "(35|50) 19 14 11 \*"/.test(l)).join("\n"));
const cleanErr = strict(clean);
ok(cleanErr.length === 0, `clean tree: ${cleanErr.length} errors${cleanErr.length ? " — " + ids(cleanErr) : ""}`);

// 3) re-introduce each live error class
const srcOf = { a390: "news-mwctll4o-24a390", b89: "news-mwctkn6g-276b89", e041: "news-mwpe749c-226041" };
const cases = [
  ["C4-data-checked", (d) => wr(d, "app.js", rd(d, "app.js").replace("function dataCheckedLabel(", "function dataCheckedLabelOld(") + '\nconst DATA_CHECKED = "14 Nov 2026";\n')],
  ["D4-flight-tag", (d) => jedit(d, "road.json", (j) => { feed(j, "news-mwpis5m8-5f4faa").flight = 16; })],
  ["E2-feed-box", (d) => jedit(d, "road.json", (j) => { feed(j, srcOf.e041).box = "static"; })],
  ["E3-speculative-box", (d) => jedit(d, "road.json", (j) => { feed(j, srcOf.e041).box = "static"; })],
  ["F1-no-publisher#1", (d) => jedit(d, "road.json", (j) => { delete feed(j, srcOf.a390).src; }), "F1-no-publisher"],
  ["F1-no-publisher#2", (d) => jedit(d, "road.json", (j) => { delete feed(j, srcOf.b89).src; }), "F1-no-publisher"],
  ["F1-no-publisher#3", (d) => jedit(d, "road.json", (j) => { delete feed(j, srcOf.e041).src; }), "F1-no-publisher"],
  ["F3-photo-credit-slot", (d) => patch(d, "photo-credit", true)],
  ["F5-about-credit", (d) => patch(d, "about-truth", true)],
  ["H6-invented-event", (d) => jedit(d, "road.json", (j) => { j.mission_updates["16"][0].line = "Remote camera shows Booster 23 catch after Flight 16 launch (RGVaerialphotos, 15 Nov)."; })],
  ["I2-push-invisible", (d) => jedit(d, "road.json", (j) => { for (const c of j.categories) for (const h of c.history) if (h.id === "x-2123269690457780726") delete h.flight; })],
  ["J2-card-box (x2: Ship 43 and Booster 23 cards)", (d) => jedit(d, "road.json", (j) => { feed(j, srcOf.e041).box = "static"; }), "J2-card-box", 2],
  ["K3-render-check", (d) => jedit(d, "data/health.json", (j) => { j.render_check.status = "failed"; j.render_check.failures = 5; })],
  ["K6-annual-cron", (d) => wr(d, ".github/workflows/mission-alert.yml", rd(d, ".github/workflows/mission-alert.yml") + '\n    - cron: "35 19 14 11 *"\n')],
];
const caught = new Set();
for (const [name, brk, want, minCount] of cases) {
  const d = snapshot(tmp("brk")); for (const f of [...FILES, ".github/workflows/mission-alert.yml"]) try { fs.copyFileSync(path.join(clean, f), path.join(d, f)); } catch {}
  brk(d);
  const r = gate.check({ root: d, files: ["road.json", "app.js"], baseline: clean, now: NOW });
  const want1 = want || name.replace(/#\d$/, "");
  const all = [...r.newErrors, ...(r.advisory || [])], blockedIds = new Set(r.newErrors.map((e) => e.id));
  const hit = all.filter((e) => e.id === want1).length >= (minCount || 1);
  const blocks = blockedIds.has(want1) && !r.ok;
  if (hit) caught.add(name);
  rows.push({ name, detected: hit, blocked: blocks, newIds: ids(r.newErrors), advisoryIds: ids(r.advisory || []) });
  ok(hit, `${blocks ? "BLOCKS" : "advises on"} re-introduced ${name} → blocking: ${ids(r.newErrors).join(", ") || "-"} | advisory: ${ids(r.advisory || []).join(", ") || "-"}`);
}
const caughtIds = new Set(rows.filter((r) => r.detected).flatMap((r) => [...r.newIds, ...r.advisoryIds]));
const blockedCases = rows.filter((r) => r.blocked);
ok(ids(liveErr).every((i) => caughtIds.has(i)) && caught.size === cases.length, `all ${ids(liveErr).length} live error classes (${liveErr.length} instances) detected at commit time (${caught.size}/${cases.length} re-introductions)`);
ok(blockedCases.map((r) => r.name.split(" ")[0].replace(/#\d/, "")).sort().join() === ["D4-flight-tag", "E2-feed-box", "E3-speculative-box", "H6-invented-event", "I2-push-invisible", "J2-card-box"].sort().join(), `blocking = content errors only: ${blockedCases.map((r) => r.name.split(" ")[0]).join(", ")}; advisory = ${rows.filter((r) => !r.blocked).map((r) => r.name.split(" ")[0]).join(", ")}`);

// 4) other bad writes + a harmless one
const other = [
  ["FLIGHTS block syntax error", (d) => wr(d, "app.js", rd(d, "app.js").replace(/(const FLIGHTS = \[\n)/, "$1  { n: 99, date: \"2026-01-01\" ,, },\n")), true],
  ["road.json emptied of boxes", (d) => jedit(d, "road.json", (j) => { j.categories = []; }), true],
  ["road.json truncated (invalid JSON)", (d) => wr(d, "road.json", rd(d, "road.json").slice(0, 5000)), true],
  ["liftoff boxes still progress right after liftoff (rollover transient: advisory only)", (d) => jedit(d, "road.json", (j) => { j.launched = j.launched || { flight: j.flight }; for (const c of j.categories) c.status = "progress"; j.feed_items = j.feed_items; }), false, true],
  ["harmless: new correct feed item", (d) => jedit(d, "road.json", (j) => { j.feed_items.unshift({ id: "news-test-1", kind: "news", title: "🚀 Starship", body: "Ship 43 moved to the Mega Bay.", url: "https://www.nasaspaceflight.com/2026/11/x/", at: "2026-11-21T17:00:00.000Z", date: "21 Nov", flight: 16, src: "NASASpaceflight" }); }), false],
];
for (const [name, brk, shouldBlock] of other) {
  const d = snapshot(tmp("oth")); for (const f of [...FILES, ".github/workflows/mission-alert.yml"]) try { fs.copyFileSync(path.join(clean, f), path.join(d, f)); } catch {}
  brk(d);
  const r = gate.check({ root: d, files: ["road.json"], baseline: clean, now: NOW });
  ok(shouldBlock ? !r.ok : r.ok, `${shouldBlock ? "blocks" : "passes"}: ${name}${r.newErrors.length ? " → " + ids(r.newErrors) : ""}`);
}

// 5) known errors do not freeze the bot
const r5 = gate.check({ root: live, files: ["road.json"], baseline: live, now: NOW });
ok(r5.ok && r5.existing === 15, `ratchet: the 15 known live errors alone do not block (existing ${r5.existing}, new ${r5.newErrors.length})`);
// gate is skipped when nothing user-visible is committed; bypass/warn modes
ok(gate.check({ root: live, files: ["notifications.json"] }).skipped, "gate skipped for notifications.json-only commits");
{ const d = snapshot(tmp("brk")); jedit(d, "road.json", (j) => { j.categories = []; });
  const prev = process.env.PIPELINE_GATE; const run = (mode) => { if (mode == null) delete process.env.PIPELINE_GATE; else process.env.PIPELINE_GATE = mode;
    let threw = false, msg = ""; try { gate.assertClean({ root: d, files: ["road.json"], baseline: live, now: NOW, log() {} }); } catch (e) { threw = true; msg = e.message; } return { threw, msg }; };
  try {
    const w = run("warn"); ok(!w.threw, "PIPELINE_GATE=warn reports without blocking");
    const dflt = run(null); ok(!dflt.threw, "default mode is warn: reports without blocking");
    const b = run("block"); ok(b.threw && /GATE blocked/.test(b.msg), "PIPELINE_GATE=block throws 'GATE blocked' (commit + push never run)");
  } finally { if (prev == null) delete process.env.PIPELINE_GATE; else process.env.PIPELINE_GATE = prev; } }

fs.writeFileSync(path.join(ROOT, "data", "gate-test-results.json"), JSON.stringify({ at: NOW, live_errors: ids(liveErr), liveCount: liveErr.length, caught: [...caught], rows }, null, 2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
