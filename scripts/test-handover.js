/* Flight 15 -> 16 handover regression (3 Nov 2026, Tusk's ?sim= run). No network, no pushes:
   node scripts/test-handover.js
   Builds the sim stages (scripts/sim-handover.js), steps a fake clock through them and runs app.js's own
   functions (pulled out of app.js like render-check.js does) plus the checker's rollover:
     A 3 Nov 18:45 · B 12 Nov 23:55 in flight · C 13 Nov 01:05 logged, hero holds · C2 02:00 hero moved on · D 09:30 checker rolled over */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const SIM = require("./sim-handover.js"), H = require("./handover.js"), FL = require("./flightlog.js"), CR = require("./check-road.js");
let pass = 0, fail = 0; const check = (ok, name) => { if (ok) { pass++; console.log(`✅ ${name}`); } else { fail++; console.log(`❌ ${name}`); } };
const F15 = `{ n: 15, date: "${SIM.T0}", pad: "Pad 2", block: "V3", booster: "B22", ship: "S42", outcome: "success", headline: "SIMULATED", highlights: "", story: "SIMULATED", photo: { thumb: "images/rtf-placeholder.jpg", gallery: [] } },`;
// app.js top-level declarations by name (+ their dependencies), with a fake clock; logged = Flight 15 in FLIGHTS
function app(logged) {
  let src = fs.readFileSync(path.join(ROOT, "app.js"), "utf8").replace(/^const nowMs = .*$/m, "const nowMs = () => globalThis.__SIM_NOW;");
  if (logged) src = src.replace("const FLIGHTS = [", `const FLIGHTS = [\n  ${F15}`);
  const lines = src.split("\n"), starts = [];
  lines.forEach((l, i) => { const m = l.match(/^(?:async\s+)?(?:const|let|function)\s+([A-Za-z_$][\w$]*)/); if (m) starts.push({ name: m[1], i }); });
  const decl = (name) => { const k = starts.findIndex((s) => s.name === name); if (k < 0) return null;
    let end = lines.length; for (let j = starts[k].i + 1; j < lines.length; j++) if (/^(?:\S)/.test(lines[j]) && !/^[}\])]/.test(lines[j])) { end = j; break; }
    return lines.slice(starts[k].i, end).join("\n"); };
  const want = ["pickNextLaunch", "flightFromLL2", "roadForHero", "rtfRows", "logList", "daysLabel", "heroVehicles", "vehicleLine", "showWatchBadge", "effectiveStatus", "pastSummary", "galleryOf", "thumbOf", "DONE_GRACE_MS", "LAST_LOGGED_N", "isLaunched"];
  const have = new Set(), parts = [];
  const add = (n) => { if (have.has(n)) return true; const d = decl(n); if (!d) return false; have.add(n); parts.unshift(d); return true; };
  want.forEach(add);
  // eager closure: every top-level name a pulled declaration mentions (JSX components left out)
  const names = new Set(starts.map((x) => x.name));
  for (let k = 0; k < parts.length; k++) for (const w of new Set(parts[k].match(/[A-Za-z_$][\w$]*/g) || [])) { if (!names.has(w) || have.has(w)) continue; const d = decl(w); if (!d || /className=|<\/[a-z]|^\s*<[A-Za-z]/m.test(d)) continue; have.add(w); parts.unshift(d); k = -1; break; }
  const window = { RoadPick: require("./road-pick.js"), RoadFlightLog: FL, RoadHandover: H, RoadCleanup: require("./cleanup.js"), addEventListener() {}, dispatchEvent() {}, location: { search: "" } };
  const React = { createElement() { return null; } }, document = {}, localStorage = { getItem() { return null; }, setItem() {} };
  for (let tries = 0; tries < 300; tries++) {
    try { return new Function("window", "React", "document", "localStorage", `${parts.join("\n")}\nreturn { ${want.join(", ")} };`)(window, React, document, localStorage); }
    catch (e) { const m = String(e.message).match(/^(\w+) is not defined/) || String(e.message).match(/Cannot access '(\w+)' before initialization/);
      if (!m) throw e;
      if (/before initialization/.test(e.message)) { const i = parts.findIndex((p) => new RegExp(`^(?:const|let|function)\\s+${m[1]}\\b`).test(p)); const [p] = parts.splice(i, 1); parts.unshift(p); continue; }
      if (!add(m[1])) throw new Error(`no top-level ${m[1]} in app.js`); }
  }
  throw new Error("could not load app.js functions");
}
const S = SIM.stages(), at = (k) => Date.parse(S.now[k]);
const hero = (A, k, ll2) => { globalThis.__SIM_NOW = at(k); const l = A.pickNextLaunch(S.ll2[ll2 || k], at(k)); return l ? A.flightFromLL2(l) : null; };
const posts = (A, road) => A.rtfRows(road).rows.filter((r) => r.post).map((r) => r.post);
const titles = (A, road) => posts(A, road).map((p) => `${p.cat.name} ${p.h.text}`);
const consistent = (road, today) => { const b = FL.boxes(road, today); return road.categories.every((c) => b[c.id] && b[c.id].status === c.status && b[c.id].latest === c.latest)
  && Object.values(b).every((x) => !(x.statusText === "Not yet" && /\bunder ?way|in progress\b/i.test(x.latest))); };

const pre = app(false), post = app(true);
check(pre.DONE_GRACE_MS === H.GRACE_MS, "app hero grace and the Road rollover share one moment (DONE_GRACE_MS = handover GRACE_MS)");

// A · before launch
{ const f = hero(pre, "A"); check(f && f.n === 15 && posts(pre, S.roads.A).length > 5, "A: hero Flight 15, Road to Flight 15 has its cards"); }
// B · in flight: launch-day items on the Road page (fix 4)
{ hero(pre, "B"); const t = titles(pre, S.roads.B); check(t.some((x) => /Liftoff/.test(x)), "B: the Liftoff update shows on the Road page (fix 4)"); }
// C · Flight 15 logged, hero still holds it
{ const f = hero(post, "C"); const road = post.roadForHero(S.roads.C, f.n), t = titles(post, road);
  check(f.n === 15, "C: hero holds Flight 15 for the grace period");
  check(road.flight === 15 && posts(post, road).filter((p) => /^rtf-/.test(p.id)).length >= 6, "C: Road page is not blank between logging and rollover (fix 1)");
  check(t.some((x) => /Liftoff/.test(x)) && t.some((x) => /Flight 15 — Success/.test(x)), "C: Liftoff and Success show on the Road page (fix 4)");
  check(!post.logList(f.n).some((x) => x.n === 15) && post.logList(16).some((x) => x.n === 15), "C: Flight 15 Success shown once (hero only, not also in the Flight Log) (fix 3)"); }
// C2 · hero moved on, checker has not rolled over yet: the app rolls the Road at the same moment (fix 2)
let c2 = null;
{ const f = hero(post, "C2", "C"); const road = post.roadForHero(S.roads.C, f.n); c2 = road; const today = FL.ukDay(S.now.C2), b = FL.boxes(road, today);
  check(f.n === 16 && road.flight === 16, "C2: hero Flight 16 and Road to Flight 16 at the same moment (fix 2)");
  check(b.faa.latest === "No Flight 16 licence yet." && !JSON.stringify(b).includes("Flight 15 licence"), "C2: FAA box says Flight 16, never 'No Flight 15 licence yet' (fix 2)");
  check(consistent(road, today), "C2: every box status, headline and pill agree (fix 5)");
  check(b.faa.cards[0].lines[0].day === "13 Nov" && b.date.cards[0].lines[0].day === "13 Nov" && road.updated === "13 Nov", "C2: FAA and date-check lines dated by the clock (13 Nov), not a stale 3 Nov (fix 9)");
  check(post.daysLabel(1) === "1 day" && post.daysLabel(2) === "2 days" && post.daysLabel(45) === "45 days", "'1 day' / '2 days' (fix 6)");
  const hv = post.vehicleLine(post.heroVehicles(f, road)); check(/Booster 23/.test(hv) && /Ship 43/.test(hv), `C2: hero vehicles shown (${hv}) (fix 8)`);
  check(!post.showWatchBadge(f, post.effectiveStatus(f, at("C2"))), "C2: no Watch live badge without a date (fix 8)");
  const t = titles(post, road); check(t.some((x) => /Liftoff/.test(x)) && t.some((x) => /Flight 15 — Success/.test(x)), "C2: Liftoff and Success stay on the Road page in Flight 15's section (fix 4)"); }
// D · the checker's rollover (check-road.js rolloverRoad, same code as run())
{ const f = hero(post, "D"); const road = post.roadForHero(S.roads.D, f.n), today = FL.ukDay(S.now.D), t = titles(post, road);
  check(road === S.roads.D && road.flight === 16, "D: checker rolled over to Flight 16");
  check(consistent(road, today), "D: road.json statuses match the pills (cryo Complete is 'done' in the data too; Pad 'Not yet' has no 'under way') (fix 5)");
  check(c2.categories.every((c, i) => c.status === road.categories[i].status && c.latest === road.categories[i].latest) && c2.vehicles.join() === road.vehicles.join(), "D: the app's own rollover (C2) and the checker's agree box for box");
  check(t.some((x) => /Road to Flight 16/.test(x)) && t.some((x) => /Liftoff/.test(x)) && t.some((x) => /Flight 15 — Success/.test(x)), "D: 'Road to Flight 16', Liftoff and Success show on the Road page (fix 4)");
  const b = FL.boxes(road, today); check(b.faa.cards[0].lines[0].day === "13 Nov", "D: FAA line refreshed for the new flight (fix 9)");
  const sum = post.pastSummary(road, 15), txt = sum.map((e) => e.text);
  check(sum.length >= 6 && ["cryo", "raptor", "static", "pad"].every((x) => sum.some((e) => e.box === x)), "D: Flight 15 summary covers every milestone, not only static fires (fix 7)");
  check(txt.every((x) => /^[A-Z].*[.]$/.test(x) && !/At least|·|\b(?:is|are) (?:being|now)\b/.test(x)) && new Set(txt).size === txt.length, "D: summary is deduped past-tense full sentences (no 'At least 2 static fires · 27 Oct, 27 Oct') (fix 7)");
  check(sum.filter((e) => e.photo).length >= 6 && sum.every((e) => !e.photo || !/rtf-placeholder/.test(e.photo.image)), "D: summary items carry real photos (fix 7)");
  const fl = { n: 15, photo: { thumb: "images/rtf-placeholder.jpg", gallery: [] } }, g = post.galleryOf(fl, sum);
  check(g.length === 2 && g.every(Boolean) && !/rtf-placeholder/.test(post.thumbOf(fl, sum)), "D: no 'Photo to come' twice: gallery and thumb use the milestones' real photos (fix 7)"); }
// checker: never rolls over before the hero does
{ check(!H.heroPast(SIM.T0, at("C")) && H.heroPast(SIM.T0, at("C2")), "checker waits for the hero: no rollover at 01:05, rollover from 01:30"); }
{ const sum = CR.rolloverRoad(JSON.parse(JSON.stringify(S.roads.C)), 15, SIM.T0).road.archive[15].summary; check(sum && JSON.stringify(sum) === JSON.stringify(H.summarize(S.roads.C)), "checker freezes the same summary the app shows"); }
// follow-up 1: after liftoff the Launch date box is history (past tense, Complete), not "Estimated NET … / No official date"
{ const lift = /^Flight 15 launched on 12 Nov at 23:30 UK time\.$/;
  const bB = FL.boxes(S.roads.B, "12 Nov").date; check(bB.status !== "done" && !lift.test(bB.latest), "B (in flight, not yet logged): Launch date box still the forecast");
  const bC = FL.boxes(S.roads.C, "13 Nov").date, l0 = bC.cards[0].lines[0];
  check(bC.status === "done" && bC.statusText === "Complete" && lift.test(bC.latest) && lift.test(l0.text) && l0.day === "12 Nov" && l0.time === "23:30", `C: Launch date box "${bC.latest}" · ${bC.statusText}`);
  check(!/Estimated NET|No official/.test(JSON.stringify(bC.cards[0].lines[0]) + bC.latest), "C: no 'Estimated NET 12 Nov' / 'No official date' after liftoff");
  const noL = JSON.parse(JSON.stringify(S.roads.C)); delete noL.launched; globalThis.ST_LAUNCH = (n) => (n === 15 ? SIM.T0 : null);
  const bA = FL.boxes(noL, "13 Nov").date; delete globalThis.ST_LAUNCH; check(lift.test(bA.latest) && bA.statusText === "Complete", "C: the app gets the same line from its own Flight Log (ST_LAUNCH) before check-road writes road.launched");
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), crSrc = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
  check(/window\.ST_LAUNCH = /.test(appSrc) && /road\.launched = \{ flight: lastN, at \}/.test(crSrc), "app sets ST_LAUNCH from FLIGHTS; check-road writes road.launched once the flight is logged");
  const sumD = S.roads.D.archive[15].summary.items.find((e) => e.box === "date"); check(sumD && lift.test(sumD.text), "D: Flight 15's frozen summary carries 'Flight 15 launched on 12 Nov at 23:30 UK time.'");
  check(S.roads.D.flight === 16 && FL.boxes(S.roads.D, "13 Nov").date.status !== "done", "D: the new Road's date box is Flight 16's forecast again"); }
// follow-up 4: repeated subject + verb sentences merge (generic, in the summary builder)
{ check(H.mergeTwo("Ship 42 fired 1 Raptor.", "Ship 42 fired all 6 Raptors.") === "Ship 42 fired one Raptor, then all six.", "merge: 'Ship 42 fired one Raptor, then all six.'");
  check(H.mergeTwo("Booster 22 completed 2 cryo tests.", "Booster 22 completed its third cryo test.") === "Booster 22 completed two cryo tests, then its third.", "merge works for any vehicle / box (cryo)");
  check(H.mergeTwo("Ship 42 completed a cryo test.", "Booster 22 completed a cryo test.") === null && H.mergeTwo("Ship 42 fired all 6 Raptors.", "Ship 42 fired all 6 Raptors.") === null, "no merge across vehicles or of identical sentences");
  const txt = S.roads.D.archive[15].summary.items.map((e) => e.text);
  check(txt.includes("Ship 42 fired one Raptor, then all six.") && !txt.some((x) => /Ship 42 fired 1 Raptor\. Ship 42 fired/.test(x)), "D: F15 static box reads 'Ship 42 fired one Raptor, then all six.'");
  const rep = txt.filter((x) => { const ss = x.split(/(?<=\.) /); return ss.some((a, i) => i && a.split(" ").slice(0, 3).join(" ") === ss[i - 1].split(" ").slice(0, 3).join(" ")); });
  check(!rep.length, `D: no summary box repeats the same subject + verb in back-to-back sentences (${rep.join(" | ")})`); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
