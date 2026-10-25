// Real-world prerequisite model (scripts/cleanup.js PREREQS + check-road applyPrereqs): ships AND boosters alike.
// A later step implies its hard prerequisites (inferred flag, no push); install reports alone never finish Raptors.
const cl = require("./cleanup.js"), cr = require("./check-road.js"), lt = require("./log-text.js");
let pass = 0, fail = 0; const check = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + msg); };
const E = (o) => ({ trust: "trusted", at: "2026-10-20T12:00:00Z", ...o });
const mk = (flight, vehicles, cats) => ({ flight, vehicles, categories: ["cryo", "raptor", "static", "pad", "faa", "date", "launch"].map((id) => ({ id, name: id, status: "progress", latest: "x", history: cats[id] || [] })) });
const raptorCard = (road, v) => cl.raptorView(road.categories.find((c) => c.id === "raptor"), road).history.find((h) => h.hardware === v);
const loud = () => { const out = []; return { log: (m) => out.push(m), out }; };

for (const [B, S, n] of [["B22", "S42", 15], ["B30", "S50", 23]]) { // current flight + a pretend future flight
  const bN = B.slice(1), sN = S.slice(1), tag = `Flight ${n}`;
  // 1) install reports alone (even trusted, "all installed") → still in progress, for both vehicle types
  let road = mk(n, [B, S], { raptor: [E({ hardware: `Ship ${sN}`, date: "20 Oct", text: `Ship ${sN} has all Raptors installed.`, log_text: `Ship ${sN} has all 6 Raptors installed.` }),
    E({ hardware: `Booster ${bN}`, date: "20 Oct", text: `Booster ${bN} has all 33 Raptors installed.`, log_text: `Booster ${bN} has all 33 Raptors installed.` })] });
  check(!raptorCard(road, S).complete && !raptorCard(road, B).complete, `${tag}: install reports alone keep ship AND booster Raptors in progress`);
  check(cr.applyPrereqs(road) === false || road.categories.find((c) => c.id === "raptor").status !== "done", `${tag}: checker keeps the Raptor box open`);
  // 2) each static-fire stage implies Raptors installed, for each vehicle type
  for (const [stage, txt] of [["heading", (v) => `${v} rolls out to Pad 2 for its static fire.`], ["in progress", (v) => `${v} static fire testing underway at Massey's.`], ["completed", (v) => `${v} completed its static fire at Pad 2.`]])
    for (const [V, name, eng] of [[S, `Ship ${sN}`, 6], [B, `Booster ${bN}`, 33]]) {
      road = mk(n, [B, S], { static: [E({ hardware: name, date: "22 Oct", text: txt(name) })] });
      const c = raptorCard(road, V);
      check(c && c.complete && c.inferred && c.log_text === `${name} has all ${eng} Raptors installed.` && cl.shortLine(c.log_text) === `${name} Raptors installed.`, `${tag}: ${name} static fire ${stage} ⇒ Raptors installed (inferred)`);
      const other = raptorCard(road, V === S ? B : S);
      check(!other || !other.complete, `${tag}: the other vehicle stays open`);
    }
  // 3) both vehicles inferred → checker marks the Raptor box done, logs "no push", adds nothing to notifications
  road = mk(n, [B, S], { static: [E({ hardware: `Ship ${sN}`, date: "22 Oct", text: `Ship ${sN} completed its static fire.` }), E({ hardware: `Booster ${bN}`, date: "21 Oct", text: `Booster ${bN} heads to Pad 2 for its static fire.` })] });
  const L = loud(); cr.applyPrereqs(road, L.log);
  check(road.categories.find((c) => c.id === "raptor").status === "done" && road.inferred[S].raptor && road.inferred[B].raptor && L.out.every((m) => /no push/.test(m)) && !road.notifications && !road.feed, `${tag}: both vehicles ⇒ Raptor box done, inferred, no push`);
  // 4) hedges / waiting / predictions never imply anything
  for (const t of [`Ship ${sN} could be ready for a static fire within two weeks.`, `Booster ${bN} is waiting to roll out for its static fire.`, `Ship ${sN} reportedly heads to its static fire.`]) {
    road = mk(n, [B, S], { static: [E({ hardware: t.split(" ").slice(0, 2).join(" "), date: "22 Oct", text: t })] });
    check(!Object.keys(cl.inferred(road)[B]).length && !Object.keys(cl.inferred(road)[S]).length, `${tag}: no inference from "${t}"`);
  }
  // 5) cryo and Raptors never imply each other (order varies)
  road = mk(n, [B, S], { cryo: [E({ hardware: `Ship ${sN}`, date: "22 Oct", text: `Ship ${sN} completed its cryo tests at Massey's.` })], raptor: [] });
  check(!cl.inferred(road)[S].raptor && !(raptorCard(road, S) || {}).complete, `${tag}: cryo done does NOT imply Raptors`);
  // 6) spin prime and launch imply Raptors too
  road = mk(n, [B, S], { static: [E({ hardware: `Booster ${bN}`, date: "22 Oct", text: `Booster ${bN} completed a spin prime.` })] });
  check(cl.inferred(road)[B].raptor && cl.inferred(road)[B].raptor.by === "spin prime", `${tag}: spin prime ⇒ Raptors installed`);
  // 7) a later flight's static fire never affects this flight
  road = mk(n, [B, S], { static: [E({ hardware: `Ship ${Number(sN) + 1}`, flight: n + 1, date: "22 Oct", text: `Ship ${Number(sN) + 1} completed its static fire.` })] });
  check(!Object.keys(cl.inferred(road)[S]).length, `${tag}: next flight's vehicle never counts`);
}
// live road.json: Ship 42's Raptors stay in progress; Booster 22 inferred
const live = require("../road.json");
const l42 = raptorCard(live, "S42"), l22 = raptorCard(live, "B22");
check(l42 && !l42.complete, "live: Ship 42 Raptors still in progress (no static fire work yet)");
check(l22 && l22.complete && l22.inferred, "live: Booster 22 Raptors installed (inferred from its static fire)");
check(live.categories.find((c) => c.id === "raptor").status === "progress", "live: Raptor box in progress");
// overview status lines: short, direct, plain state (~6 words, max 8, one line)
const lines = { faa: "No Flight 15 licence yet.", date: "Flight 15 NET 8 November." };
for (const [id, t] of Object.entries(lines)) check(live.categories.find((c) => c.id === id).log_latest === t && !lt.lintStatusLine(t).length, `live ${id}: "${t}"`);
for (const c of live.categories) { const v = cl.flightLogView(c, live); const s = cl.shortLine(require("fs").readFileSync(__dirname + "/../road.json") && (v.log_latest || v.latest)); check(!lt.lintStatusLine(s).length, `live ${c.id} overview "${s}" is short and plain`); }
for (const [a, b] of [["Booster 22 completed its static fire at the launch site.", "Booster 22 static fire done."], ["Ship 42 completed further cryo tests.", "Ship 42 cryo tests done."], ["Ship 43 has all 6 Raptors installed.", "Ship 43 Raptors installed."], ["Booster 24 is getting its Raptors installed.", "Booster 24 Raptors going in."], ["Ship 44 rolls out to Massey's for cryo testing.", "Ship 44 heading to Massey's."]])
  check(cl.shortLine(a) === b, `shortLine: "${a}" → "${b}"`);
check(lt.lintStatusLine("FAA licence covers Flight 14 only, with no Flight 15 change yet.").length > 0 && lt.cleanStatusLine("No Flight 15 licence yet") === "No Flight 15 licence yet." && lt.lintStatusLine("NSF says no licence yet.").includes("public source name"), "status-line lint: long/reasoned lines and source names rejected");
const xf = require("fs").readFileSync(__dirname + "/x-first.js", "utf8"), crs = require("fs").readFileSync(__dirname + "/check-road.js", "utf8");
check(/status_line \(road only/.test(xf) && /about 6 words \(max 8\)/.test(xf) && /No Flight 15 licence yet/.test(xf) && /ships and boosters/.test(xf), "x-first prompt asks for a ~6-word status line (both vehicle types)");
check(/about 6 words \(max 8\)/.test(crs) && /box\.log_latest = entry\.status_line \|\|/.test(crs), "check-road prompt + status use the short line");
console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
