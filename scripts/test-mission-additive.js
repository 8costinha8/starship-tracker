// Mission updates are additive (replay of a14b353, 29 Oct 02:45).  node scripts/test-mission-additive.js
const M = require("./mission.js");
let fails = 0, n = 0; const check = (ok, m) => { n++; console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const L22 = "SpaceX plans to catch both Booster 22 and Ship 42 on Flight 15 (Elon Musk, 22 Oct).";
const post = (id, at, user, text) => ({ post_id: id, created_at: at, url: `https://x.com/${user}/status/${id}`, author: { username: user }, text });
const road = () => ({ flight: 15, mission_updates: { 15: [{ topic: "catch", line: L22, at: "2026-10-21T23:05:30.000Z", src: "@NASASpaceflight", url: "https://x.com/NASASpaceflight/status/2113044031638741321", post_id: "2113044031638741321" }] } });
// a14b353 replay: Elon's 29 Oct catch post
const r = road();
const res = M.applyMissionUpdate(r, 15, { topic: "catch", text: "Ship 42 will be the first ship ever caught by the tower", attribution: "Elon Musk", post: post("2115634093949911506", "2026-10-29T02:37:29.000Z", "elonmusk", "Ship 42 will be the first ship caught by the tower") });
const lines = r.mission_updates[15].map((u) => u.line);
check(res.changed && !res.superseded.length, "a14b353: Elon's 29 Oct catch post adds a line (nothing superseded)");
check(lines.length === 2 && lines[0] === L22 && lines[1] === "Ship 42 will be the first ship ever caught by the tower (Elon Musk, 29 Oct).", "a14b353: the 22 Oct double-catch line stays first, 29 Oct line after it");
// the same post again / same text from another post → true duplicate
check(!M.applyMissionUpdate(r, 15, { topic: "catch", text: "Ship 42 will be the first ship ever caught by the tower", attribution: "Elon Musk", post: post("2115634093949911506", "2026-10-29T02:37:29.000Z", "elonmusk", "Ship 42 tower") }).changed, "same post again: deduped");
check(!M.applyMissionUpdate(r, 15, { topic: "catch", text: "Ship 42 will be the first ship ever caught by the tower", attribution: "Elon Musk", post: post("9", "2026-10-29T05:00:00.000Z", "elonmusk", "Ship 42 tower") }).changed && r.mission_updates[15].length === 2, "same text, different post: deduped");
// explicit contradiction supersedes same-topic lines (logged via r.superseded)
const r2 = road();
const s = M.applyMissionUpdate(r2, 15, { topic: "catch", text: "SpaceX cancelled the ship catch; only Booster 22 will be caught", attribution: "SpaceX", post: post("10", "2026-10-30T10:00:00.000Z", "SpaceX", "Starship ship catch cancelled") });
check(s.changed && s.superseded.length === 1 && s.superseded[0] === L22 && r2.mission_updates[15].length === 1, "explicit contradiction (catch cancelled) supersedes the earlier line and reports it");
// core line first, rest chronological, max 5 keeps the core
const r3 = road(); M.applyMissionUpdate(r3, 15, { topic: "objectives", text: "Flight 15 will deploy Starlink simulators", attribution: "SpaceX", post: post("20", "2026-10-25T10:00:00.000Z", "SpaceX", "Starship Flight 15 objectives") });
for (let i = 0; i < 5; i++) M.applyMissionUpdate(r3, 15, { topic: "trajectory", text: `Flight 15 trajectory note ${"abcde"[i]}`, attribution: "SpaceX", post: post(String(30 + i), `2026-10-2${6 + (i % 3)}T1${i}:00:00.000Z`, "SpaceX", "Starship Flight 15 trajectory") });
const l3 = r3.mission_updates[15];
check(l3.length === 5 && l3[0].topic === "objectives" && l3.slice(1).every((u, i, a) => !i || Date.parse(a[i - 1].at) <= Date.parse(u.at)), "core line first, the rest oldest → newest, max 5");
let ok = true; try { M.validateMission(r); M.validateMission(r3); } catch { ok = false; } check(ok, "several lines per topic pass validation");
console.log(`\n${n - fails}/${n} checks passed`); process.exit(fails ? 1 : 0);
