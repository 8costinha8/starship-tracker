/* Offline: hedged "completed" wording never marks anything complete (x-first guard + live pipeline flags). */
const xf = require("./x-first.js"), fs = require("fs"), path = require("path");
let fails = 0; const check = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fails++; };
const road = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const post = (text, u = "LabPadre") => ({ post_id: "1", text, author: { username: u }, created_at: "2026-10-30T10:00:00Z", url: "https://x.com/a/status/1" });
const V = (o) => ({ kind: "road", stage: "static", hardware: "B23", flight: 16, event: "static_fire", phase: "completed", status: "done", text: "Booster 23 completed a static fire.", ...o });
const hedged = ["B23 appears to have completed its static fire", "Booster 23 likely completed a static fire this morning", "Looks like B23 finished the static fire", "B23 seems to have wrapped up its static fire", "B23 probably done with static fire testing", "Booster 23 may have completed its static fire"];
for (const t of hedged) {
  const g = xf.guardPost(road, post(t), V({}));
  const v = g.v || {};
  check(!g.skip && xf.phaseOf(v) !== "completed" && v.status !== "done" && v.inferred === true, `hedged "${t}" → ${xf.phaseOf(v)} / ${v.status}, inferred (no status, no milestone)`);
}
check(xf.guardPost(road, post("Ship 43 rolled out"), V({ text: "Ship 43 likely completed cryo testing." })).v.status !== "done", "hedge in the writer's own text also blocks completion");
for (const t of ["Booster 23 completed its static fire!", "B23 static fire complete. Likely rolling back to Massey's tomorrow", "B23 finished a full-duration static fire; it could fly on Flight 16"]) {
  const g = xf.guardPost(road, post(t), V({}));
  check(g.v && xf.phaseOf(g.v) === "completed" && !g.v.hedged, `plain completion still completes: "${t}"`);
}
check(xf.guardPost(road, post("B23 appears to have completed its static fire"), V({ phase: "progress", status: "progress" })).v.status === "progress", "hedged post already at progress is unchanged");
const src = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
check(/r\.tier <= 2 && !v\.inferred && \(/.test(src) && /phaseOf\(v\) === "completed" && r\.accurate !== false && r\.tier <= 2 && !v\.inferred\) milestone/.test(src) && /!r\.st && r\.accurate !== false && !v\.inferred/.test(src), "status and milestone moves require !inferred (what the hedge guard sets)");
console.log(fails ? `\n${fails} FAILED` : "\n✅ All hedged-completion checks passed."); process.exit(fails ? 1 : 0);
