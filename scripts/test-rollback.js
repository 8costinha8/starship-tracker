// Rollbacks to the Megabay follow the vehicle's latest completed test (29 Oct S42 case).  node scripts/test-rollback.js
const fs = require("fs"), path = require("path"), P = require("./purpose.js"), X = require("./x-first.js"), fl = require("./flightlog.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const ROOT = path.join(__dirname, ".."), live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const step = (text, hw = "S42") => ({ text, hardware: hw, at: "2026-10-29T07:00:00Z", date: "29 Oct" });
for (const t of ["Ship 42 left Massey's and moved into Mega Bay 2.", "Ship 42 is back at the production site / Megabay 2.", "Ship 42 and the tiled barrel section have arrived back at the production site."])
  check(P.purposeOf(live, step(t)).box === "static", `purpose: "${t}" → Static fires (rollback after static fires)`);
check(P.purposeOf(live, step("Booster 22 rolled out to Pad 2.", "B22")).box === "pad", "purpose: a rollout TO the pad stays Pad activity");
check(P.refile(JSON.parse(JSON.stringify(live))).length === 0, "live road.json is stable under re-file");
const rb = X.rollbackStage(live, "S42 has been moved into MB2 after leaving Massey's", "S42", 15);
check(rb && rb.stage === "static" && rb.label === "static fires", "x-first guard: latest completed test for S42 is static fires");
check(X.rollbackStage(live, "Booster 22 rolled out of Megabay 2 to Pad 2", "B22", 15) === null, "x-first guard: a rollout OUT of the Megabay is not a rollback");
const g = X.guardPost(live, { text: "Ship 42 left masseys and S42 has been moved into MB2", author: { username: "Blobifie" } }, { kind: "road", stage: "cryo", event: "cryo_test", phase: "completed", hardware: "S42", flight: 15, text: "Ship 42 left Massey's and moved into Mega Bay 2.", log_text: "Ship 42 rolled back to Mega Bay 2 after cryo tests.", status_line: "Ship 42 cryo tests completed." }).v;
check(g && g.stage === "static" && !g.event && g.phase === "progress" && /after static fires/.test(g.log_text) && !g.status_line, "x-first guard: the 06:37 Blobifie verdict → Static fires, no completion, 'after static fires'");
const cats = Object.fromEntries(live.categories.map((c) => [c.id, c]));
const at = (id) => Object.keys(cats).filter((k) => (cats[k].history || []).some((h) => h.id === id));
const card = cats.static.history.find((h) => h.id === "x-2115701002095755563");
check(at("x-2115701002095755563").join() === "static" && !at("x-2115694440891498638").length && !at("x-2115713308573782488").length && ["2115694440891498638", "2115713308573782488"].every((id) => card.x_posts.includes(id)), "road.json: one 29 Oct S42 rollback card in Static fires; the Blobifie + LabPadre posts are merged into it (old ids kept in x_posts)");
check(!JSON.stringify(live).includes("after cryo tests") && card.updates.some((u) => u.log_text === "Ship 42 rolled back to Mega Bay 2 after static fires."), "flight log line says 'after static fires'");
check((live.feed_items || []).filter((f) => /arrived back at the production site/.test(f.body || "")).every((f) => f.box === "static"), "feed item for the same event is filed under static");
const b = fl.boxes(live);
check(b.cryo.statusText === "Complete" && b.static.statusText === "Complete" && b.pad.statusText === "In progress", "Flight Log states unchanged by the move (cryo/static ● Complete, pad ◐ In progress since the 31 Oct 12 Sep test line)");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
