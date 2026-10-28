// Mission lines: Starship posts only (no Falcon 9 / Starlink / Dragon), and the text never repeats the credited name.
const assert = require("assert"), fs = require("fs"), path = require("path");
const M = require("./mission.js");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; };
const post = (text, id = "1") => ({ text, post_id: id, created_at: "2026-10-22T10:00:00Z", url: "https://x.com/SpaceX/status/" + id, author: { username: "SpaceX" } });
for (const t of ["Payload deployment sequence is complete", "Falcon 9 launches 24 Starlink satellites to low-Earth orbit", "Deployment of 28 Starlink satellites confirmed", "Dragon separation confirmed", "Crew-12 docking confirmed", "Falcon 9's first stage has landed on the A Shortfall of Gravitas droneship"]) {
  const r = {}; const res = M.applyMissionUpdate(r, 15, { topic: "payload", text: t, post: post(t) });
  ok(!res.changed && res.rejected && !(r.mission_updates && r.mission_updates[15] && r.mission_updates[15].length), "rejected: " + t);
}
{ const r = {}; ok(M.applyMissionUpdate(r, 15, { topic: "catch", text: "SpaceX is attempting a double catch on Flight 15", attribution: "Elon Musk", post: post("Go for double catch on Flight 15", "2") }).changed, "Starship post accepted"); }
{ const r = { rejected_lines: [{ box: "mission", post_id: "9" }] }; ok(!M.applyMissionUpdate(r, 15, { topic: "catch", text: "Flight 15 catch", post: post("Flight 15 catch", "9") }).changed, "rejected_lines post never re-added"); }
// credited name never repeated
ok(M.lineFor({ text: "Elon Musk says SpaceX is go for double catch on Flight 15", attribution: "Elon Musk", at: "2026-10-22T10:00:00Z" }) === "SpaceX is go for double catch on Flight 15 (Elon Musk, 22 Oct).", "strip 'Elon Musk says'");
ok(M.lineFor({ text: "Musk confirmed that the ship will be caught", attribution: "Musk confirmed", at: "2026-10-22T10:00:00Z" }) === "The ship will be caught (Musk confirmed, 22 Oct).", "strip 'Musk confirmed that', capitalise");
ok(M.lineFor({ text: "SpaceX said the FAA review is done", attribution: "NSF reports", at: "2026-10-22T10:00:00Z" }).startsWith("SpaceX said"), "other speakers kept");
// app display guard + live data + prompt rules (one prompt used by Grok and the Claude fallback)
const ROOT = path.join(__dirname, ".."), app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), xf = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
const src = app.match(/function noCreditRepeat[\s\S]*?\n}\n/)[0]; const noCreditRepeat = new Function(src + "; return noCreditRepeat;")();
ok(noCreditRepeat("Elon Musk says SpaceX is go for double catch on Flight 15 (Elon Musk, 22 Oct).") === "SpaceX is go for double catch on Flight 15 (Elon Musk, 22 Oct).", "app strips repeated credit");
ok(noCreditRepeat("NSF says pad work continues (SpaceX, 20 Oct).") === "NSF says pad work continues (SpaceX, 20 Oct).", "app keeps other speakers");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8")), mu = live.mission_updates[15];
ok(!mu.some((u) => /Payload deployment/.test(u.line)) && mu.some((u) => u.line === "SpaceX is attempting a double catch on Flight 15 (Elon Musk, 22 Oct)."), "live lines fixed");
ok(live.rejected_lines.some((r) => r.box === "mission" && r.post_id === "2112543527481876848"), "rejected_lines entry");
ok(/STARSHIP ONLY/.test(xf) && /NEVER repeats the person or org named in the attribution/.test(xf), "writer prompt rules");
console.log(`test-mission-guard: ${n} passed`);
