/* 1 Nov round: prep items stay out of Raptor history, summaries only from the flight's own vehicles, journey counts are
   confirmed events, and the new render-check classes (badge, full stop, ' / ', duplicate View on X).
   No network, no pushes: node scripts/test-nov01.js */
const fs = require("fs"), path = require("path");
const P = require("./purpose.js"), SC = require("./summary-scope.js"), J = require("./journey.js"), JR = require("./journey-replay.js");
const RC = require("./render-check.js"), BF = require("./backfill-2026-11-01.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const ROOT = path.join(__dirname, "..");
const snap = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "snapshots", "2026-11-01", "road.json"), "utf8"));
const clone = (x) => JSON.parse(JSON.stringify(x));
// 2) prep vs milestone
check(P.isEnginePrep("Lifting jig raised for Booster 22 engine testing in Megabay 1."), "lifting jig = engine prep");
check(!P.isEnginePrep("Booster 22 was ready with all 33 Raptors."), "'ready with all 33 Raptors' is not prep");
check(P.purposeOf(snap, { text: "Lifting jig raised for Booster 22 engine testing in Megabay 1.", date: "24 Oct" }).box !== "raptor", "prep line is not filed in Raptor history");
check(P.purposeOf(snap, { text: "Booster 22 was ready with all 33 Raptors.", date: "24 Oct" }).box === "raptor", "completion line files to Raptor");
check(P.purposeOf(snap, { text: "Three more Raptor 3s removed from Ship 42.", date: "30 Sep" }).box === "raptor", "engine removal still files to Raptor");
// 7) summaries
check(!SC.inScope(snap, { text: "Ship 43 back at Megabay 2.", hardware: "S43" }), "Ship 43 (Flight 16) cannot set a Flight 15 summary");
check(!SC.inScope(snap, { text: "Booster 22 moved.", flight: 16 }), "another flight's tag cannot set a summary");
check(SC.inScope(snap, { text: "Booster 22 was lifted to catch height.", hardware: "B22" }), "B22 can");
check(SC.inScope(snap, { text: "Pad 2 deluge test." }), "pad work with no vehicle can");
const pr = clone(snap); const pad = pr.categories.find((c) => c.id === "pad");
pad.history.unshift({ id: "t-s43", date: "31 Oct", text: "Ship 43 back at Megabay 2.", hardware: "S43", trust: "trusted" });
pad.history.push({ id: "t-pad", date: "1 Oct", text: "Lifting jig raised for Booster 22 engine testing in Megabay 1.", trust: "trusted" });
// 8) journey counts
const B = JR.replay(snap, "B22").state.done, S = JR.replay(snap, "S42").state.done;
check(B.static === 1 && snap.milestones.B22.static_fire.count === 1, `B22 static fires = milestones (1): got ${B.static}`);
check(S.static === 2 && snap.milestones.S42.static_fire.count === 2, `S42 static fires = milestones (2): got ${S.static}`);
check(B.cryo === 1, `B22 cryo = 1 (Blobifie + LabPadre describe the same 9–10 Sep test; a repeated post adds 0): got ${B.cryo}`);
check(S.cryo === 3, `S42 cryo = 3 (two back-to-back + the third): got ${S.cryo}`);
let st = J.blank(); st = J.step(st, "Ship 99 completed a static fire.", { v: "S99", at: "2026-01-01T00:00:00Z" }).state;
st = J.step(st, "Ship 99 completed both its single- and six-engine static fire tests.", { v: "S99", at: "2026-01-03T00:00:00Z" }).state;
check(st.done.static === 1, "a recap ('completed both …') adds 0");
st = J.step(st, "Ship 99 completed a static fire.", { v: "S99", at: "2026-01-05T00:00:00Z", url: "u1" }).state;
st = J.step(st, "Ship 99 completed a static fire.", { v: "S99", at: "2026-01-09T00:00:00Z", url: "u1" }).state;
check(st.done.static === 2, "the same post seen twice adds 0; a new event days later adds 1");
// render-check classes on the 1 Nov fixture (pre-fix)
const before = RC.check(snap, { creditLink: true }), has = (t, re) => before.some((f) => f.type === `render-${t}` && re.test(f.msg));
check(has("punctuation", /ahead of returning to Megabay 1" has no full stop/), "missing full stop caught (Pad · B22 26 Oct)");
check(has("punctuation", /production site \/ Megabay 2\." uses ' \/ '/), "' / ' in prose caught");
check(has("badge", /ship-cryo\.jpg has no avatar badge/), "photo without a badge caught (Cryo · S42)");
check(has("links", /Pad activity · Booster 22: two 'View on X'/), "duplicate View on X caught (credit-only photo)");
check(!RC.creditLinkInApp(), "app.js: the credit-only footer no longer adds a second View on X");
// backfill: fixes everything except the unbadgeable standing photo; idempotent; links kept; locks untouched
const fx = clone(snap), nr = { items: [{ type: "journey", msg: "B22: journey cryo count 2 stored vs 3 replayed (kept stored; needs review)" }] };
BF.apply(fx, nr, { log: () => {} });
const after = RC.check(fx).filter((f) => !/^render-(fragment|shorthand|mismatch)$/.test(f.type)); // later 1 Nov checks: fixed by backfill-2026-11-01c.js (test-nov01c.js)
for (const f of after) console.log(`   left: [${f.type}] ${f.msg}`);
check(after.length === 1 && after[0].type === "render-badge" && /ship-cryo/.test(after[0].msg), "after the backfill only the ship-cryo standing photo (unknown source) is left");
{ const C = require("./backfill-2026-11-01c.js"), fc = clone(fx); C.apply(fc, { log: () => {} }); const left = RC.check(fc).filter((f) => /^render-(fragment|shorthand|mismatch)$/.test(f.type)); for (const f of left) console.log(`   left: [${f.type}] ${f.msg}`);
  check(left.length === 0, "the 1 Nov round-3 backfill clears the wording, shorthand and card-vs-feed checks on this fixture too"); }
check(BF.apply(clone(fx), { items: [] }, { log: () => {} }).length === 0, "backfill is idempotent");
const urls = (x) => new Set(JSON.stringify(x).match(/https:\/\/[^"\s]+/g)); const ua = urls(fx);
check([...urls(snap)].every((u) => ua.has(u)), "no source link dropped");
const locks = (x) => JSON.stringify(x.categories.flatMap((c) => (c.history || []).filter((h) => h.media_override && h.media_override.keep_image).map((h) => [h.id, h.media_override])));
check(locks(snap) === locks(fx), "keep_image media untouched");
check(nr.items.length === 0, "resolved needs-review item cleared");
const c = (r, id) => r.categories.find((x) => x.id === id);
check(c(fx, "pad").log_latest && !/Ship 43/.test(c(fx, "pad").log_latest), `pad log_latest from Flight 15 vehicles: "${c(fx, "pad").log_latest}"`);
check(c(fx, "static").status === "done", "static status done");
check(!c(fx, "raptor").history.some((h) => /lifting jig/i.test(h.text)) && /33 Raptors/.test(c(fx, "raptor").history.find((h) => h.hardware === "B22").card_text), "Raptor · B22 card = completion; jig line out of raptor history");
check(fx.journeys.B22.done.static === 1 && fx.journeys.S42.done.static === 2 && fx.journeys.B22.done.cryo === 1, "stored journeys recounted");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
