/* Road cards (road-cards.js): generic per-section, per-vehicle model + copy rules. Pure, no network, no pushes. */
const RC = require("../road-cards.js"), xf = require("./x-first.js"), fs = require("fs"), path = require("path");
let fails = 0, n = 0; const check = (ok, m) => { n++; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${m}`); };
const road = (hist, extra = {}) => ({ flight: 15, updatedAt: "2026-10-23T12:00:00Z", vehicles: ["B22", "S42"], categories: [{ id: "cryo", name: "Cryo tests", color: "#BFE6FF", status: "progress", history: hist }, { id: "raptor", name: "Raptor engines", history: [] }], ...extra });
const E = (id, hw, date, at, text, phase, more = {}) => ({ id, date, at, text, x_text: text, src: "@LabPadre", url: "https://x.com/LabPadre/status/" + id, tier: 2, x_first: true, stage: "cryo", hardware: hw, milestone: { key: `cryo_test|15|${hw}`, type: "cryo_test", flight: 15, hardware: hw, phase }, ...more });
const cryo = (r) => RC.roadModel(r).sections.find((s) => s.box.id === "cryo");
// one vehicle done → one glow, section In progress
{ const r = road([E("1", "B22", "9 Sep", "2026-09-09T12:00:00Z", "Booster 22 completed its cryo test at Massey's.", "completed"), E("2", "S42", "22 Oct", "2026-10-22T12:00:00Z", "Ship 42 is in cryo testing at Massey's.", "progress")]);
  const s = cryo(r); check(s.cards.filter((c) => c.completed).length === 1 && s.status === "progress" && RC.roadModel(r).done === 0, "one vehicle done → one glowing card, section In progress, 0 done"); }
// both done → Completed, dot fills, count updates
{ const r = road([E("1", "B22", "9 Sep", "2026-09-09T12:00:00Z", "Booster 22 completed its cryo test at Massey's.", "completed"), E("2", "S42", "22 Oct", "2026-10-22T12:00:00Z", "Ship 42 has completed its cryo tests.", "completed")]);
  const m = RC.roadModel(r); check(cryo(r).status === "completed" && m.done === 1, "both vehicles done → section Completed, 1 of N done (dot fills)"); }
// new update appends a line to the existing card (placePost), no duplicate card
{ const r = road([E("10", "S42", "3 Sep", "2026-09-03T21:09:00Z", "Ship 42 completes its first cryo test.", "progress")]);
  const p = { post_id: "11", url: "https://x.com/LabPadre/status/11", created_at: "2026-09-09T12:00:00Z", text: "S42 heads back to Massey's", author: { username: "LabPadre" }, media: [] };
  const res = xf.placePost(r, p, { kind: "road", stage: "cryo", hardware: "S42", text: "Ship 42 heads back to Massey's for further cryo testing.", event: "cryo_test", phase: "progress", flight: 15, media_fit: "none" });
  const s = cryo(r); check(res.merged && s.cards.length === 1 && s.cards[0].lines.length === 2 && s.cards[0].lines[0].text === "Ship 42 heads back to Massey's for further cryo testing.", "a new update appends a line to the existing S42 card (newest first)");
  check(r.categories[0].history.length === 1, "no duplicate card for the same vehicle"); }
// no duplicate cards even from legacy entries
{ const r = road([E("1", "S42", "9 Oct", "2026-10-09T12:00:00Z", "Ship 42 heads back to Massey's.", "progress"), { date: "9 Sep", text: "Ship 42 heads back to Massey's for further cryo testing.", hardware: "S42", flight: 15 }]);
  check(cryo(r).cards.filter((c) => c.key === "S42").length === 1, "legacy + new entries for one vehicle → one card"); }
// dates: one date, start day, no time
check(RC.cardDate("9–10 Sep") === "9 Sep" && RC.cardDate("3–4 Sep") === "3 Sep" && RC.cardDate("30 Sep–2 Oct") === "30 Sep" && RC.cardDate("9 Oct · 15:36 UK") === "9 Oct", "card dates: single start date, never a range or a time");
// inferred (assumed) completion: card completes, reason line, nothing written back (so no push)
{ const r = road([E("1", "S42", "9 Oct", "2026-10-09T12:00:00Z", "Ship 42 heads back to Massey's for another cryo test.", "progress")]); const before = JSON.stringify(r);
  const c = cryo(r).cards[0]; check(c.completed && c.assumed && /so (it|cryo testing) is done\.$/.test(c.lines[0].text) && !/assumed/i.test(c.lines.map((l) => l.text).join()), "typical duration passed → completed (assumed=true), short reason line, no 'assumed' wording");
  check(JSON.stringify(r) === before, "an assumed completion is display-only: road.json untouched, so check-road can never push it");
  const r2 = road([E("1", "S42", "9 Oct", "2026-10-09T12:00:00Z", "Ship 42 heads back to Massey's for another cryo test.", "progress")], { updatedAt: "2026-10-11T12:00:00Z" });
  check(!cryo(r2).cards[0].completed, "within the typical duration → still In progress");
  const r3 = road([E("1", "S42", "9 Oct", "2026-10-09T12:00:00Z", "Ship 42 heads back to Massey's for another cryo test.", "progress"), E("2", "S42", "11 Oct", "2026-10-11T12:00:00Z", "Ship 42 rolled back to Mega Bay 2.", "progress")], { updatedAt: "2026-10-11T13:00:00Z" });
  check(cryo(r3).cards[0].completed && cryo(r3).cards[0].lines[0].text === "Back from Massey's, so cryo testing is done.", "rollback to the Mega Bay → test done (reason line)"); }
// speculation stays Expected
{ const r = road([E("1", "B22", "20 Oct", "2026-10-20T12:00:00Z", "Booster 22 could start cryo testing next week.", "expected")]); r.categories[0].status = "pending"; check(cryo(r).status === "expected", "speculation stays Expected"); }
// copy lint
const bad = ["Ship 42 completed it's cryo tests.", "Ship 42's completes its first cryo test.", "Booster 22 is been tested.", "Ship 42 completed has completed cryo.", "Ship 42 the the stand.", "Ship 42 is being transported to Massey's.", "9–10 Sep Booster 22 cryo."];
check(bad.every((t) => RC.lintCopy(t).length), "lint catches it's/its, \"Ship 42's completes\", is been, repeated verb, doubled word, filler, ranges");
check(!RC.lintCopy("Booster 22 completed its cryo test at Massey's.").length && !RC.lintCopy("Ship 42 heads back to Massey's for further cryo testing.").length, "lint passes the standard sentences");
// preview data: every timeline line and every section summary passes the lint; Cryo uses the exact standard wording
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
const lines = RC.flightsIn(live).flatMap((f) => RC.roadModel(live, f).sections.flatMap((s) => s.cards.flatMap((c) => c.lines.map((l) => [s.box.id, l.text]))));
const lint = lines.map(([b, t]) => [b, t, RC.lintCopy(t)]).filter((x) => x[2].length);
check(!lint.length, `every Road line passes the copy lint (${lines.length} lines)${lint.length ? ": " + lint.map((x) => `[${x[0]}] "${x[1]}" ${x[2].join("; ")}`).join(" || ") : ""}`);
{ const s = RC.roadModel(live).sections.find((x) => x.box.id === "cryo"), S = s.cards.find((c) => c.key === "S42"), B = s.cards.find((c) => c.key === "B22");
  check(s.box.latest === "Ship 42 completed its cryo tests at Massey's." && RC.phaseOfText(s.box.latest) === "completed", "Cryo summary states the outcome: \"Ship 42 completed its cryo tests at Massey's.\"");
  check(S && S.lines.map((l) => `${l.shown}|${l.text}`).join() === "9 Oct|Ship 42 has completed its cryo tests.,4 Sep|Ship 42 heads back to Massey's for further cryo testing.,3 Sep|Ship 42 completes its first cryo test.", "Ship 42 timeline: exact standard wording, single dates");
  check(B && B.lines.map((l) => `${l.shown}|${l.text}`).join() === "9 Sep|Booster 22 completed its cryo test at Massey's.", "Booster 22 timeline: exact standard wording, '9 Sep'");
  check(S.completed && B.completed && s.status === "completed", "preview: Cryo Completed, both cards complete (glow), Cryo dot fills");
  check(s.cards.every((c) => c.lines.some((l) => l.phase === "completed" && /\bcomplete[sd]\b/.test(l.text)) || c.assumed), "every completed card has a 'completed'/'completes' line (or an inferred reason line)"); }
// numbered boxes (one per test/event instance), only the latest open, glow from the latest box
{ const s = RC.roadModel(live).sections.find((x) => x.box.id === "cryo"), S = s.cards.find((c) => c.key === "S42"), B = s.cards.find((c) => c.key === "B22");
  check(S.boxes.map((b) => `${b.title}|${b.place}|${b.date}|${b.text}`).join(" ;; ") === "Cryo test #3|Massey's|9 Oct|Ship 42 has completed its cryo tests. ;; Cryo test #2|Massey's|4 Sep|Ship 42 heads back to Massey's for further cryo testing. ;; Cryo test #1|Massey's|3 Sep|Ship 42 completes its first cryo test.", "S42: Cryo test #3, #2, #1 newest on top, 📍 Massey's, one date, Bernardo's wording");
  check(B.boxes.length === 1 && B.boxes[0].title === "Cryo test #1" && B.boxes[0].date === "9 Sep" && B.boxes[0].place === "Massey's", "B22: Cryo test #1 · Massey's · 9 Sep");
  check(S.boxes[0].completed && S.completed && B.completed && s.status === "completed", "latest boxes completed → both cards glow → Cryo Completed"); }
{ const r = road([E("1", "S42", "3 Sep", "2026-09-03T12:00:00Z", "Ship 42 completes its first cryo test.", "completed"), E("2", "S42", "9 Oct", "2026-10-09T12:00:00Z", "Ship 42 heads back to Massey's for another cryo test.", "progress")], { updatedAt: "2026-10-10T12:00:00Z" });
  const c = cryo(r).cards[0]; check(c.boxes.length === 2 && c.boxes[0].n === 2 && !c.boxes[0].completed && c.boxes[1].completed && !c.completed && cryo(r).status === "progress", "glow comes from the LATEST box: an older completed test doesn't make the card glow"); }
{ const r = road([E("1", "S42", "3 Sep", "2026-09-03T12:00:00Z", "Ship 42 completes its first cryo test.", "completed")]);
  const p = (id, at, t) => ({ post_id: id, url: "https://x.com/LabPadre/status/" + id, created_at: at, text: t, author: { username: "LabPadre" }, media: [] });
  const cls = (t) => ({ kind: "road", stage: "cryo", hardware: "S42", text: t, event: "cryo_test", phase: "progress", flight: 15, media_fit: "none" });
  xf.placePost(r, p("5", "2026-10-09T10:00:00Z", "S42 back at Massey's"), cls("Ship 42 heads back to Massey's for another cryo test."));
  let c = cryo({ ...r, updatedAt: "2026-10-09T13:00:00Z" }).cards[0];
  check(c.boxes.length === 2 && c.boxes[0].title === "Cryo test #2" && c.boxes[1].title === "Cryo test #1", "a new test instance adds box #2 on top; #1 becomes a collapsed toggle");
  xf.placePost(r, p("6", "2026-10-10T10:00:00Z", "S42 cryo done"), { ...cls("Ship 42 completed its cryo test at Massey's."), phase: "completed" });
  c = cryo({ ...r, updatedAt: "2026-10-10T13:00:00Z" }).cards[0];
  check(c.boxes.length === 2 && c.boxes[0].text === "Ship 42 completed its cryo test at Massey's." && c.boxes[0].completed && c.completed, "an update to the same instance updates box #2 (no new box) and its completion makes the card glow");
  check(cryo(r).cards.length === 1 && new Set(c.boxes.map((b) => b.n)).size === c.boxes.length, "no duplicate cards or boxes"); }
// writer prompt carries the copy rules
{ const pr = xf.classifyPrompt({ flight: 15, vehicles: ["B22", "S42"] }, [], []);
  check(/vehicle \+ action \+ place/.test(pr) && /"its"/.test(pr) && /doubled words/.test(pr) && /is been/.test(pr) && /Ship 42's completes/.test(pr) && /completed has completed/.test(pr) && /filler/.test(pr), "writer prompt: one plain sentence, vehicle + action + place, grammar and duplicate-word rules"); }
console.log(fails ? `\n${fails} of ${n} FAILED` : `\nall ${n} passed`); process.exit(fails ? 1 : 0);
