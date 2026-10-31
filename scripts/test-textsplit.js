// push_text / card_text split: rules, writer schema + prompt, journey confirm, push + card wiring, backfilled data.
const fs = require("fs"), path = require("path"), root = path.join(__dirname, "..");
const TS = require("./text-split.js"), J = require("./journey.js"), XF = require("./x-first.js"), CR = require("./check-road.js");
let pass = 0, fail = 0; const check = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + msg); };
const FROST = "Frost on both tanks: Ship 42 likely in another cryo test.";
// rules
check(TS.toCard(FROST, { confirmed: false }) === "Ship 42 likely ran another cryo test.", "unconfirmed frost → 'likely ran'");
check(TS.toCard(FROST, { confirmed: true }) === "Ship 42 completed another cryo test.", "confirmed frost → 'completed'");
check(TS.toCard("Frost on the stack: Ship 42 likely in a launch rehearsal (WDR).", { confirmed: false }) === "Ship 42 likely had a launch rehearsal (WDR).", "unconfirmed WDR → 'likely had'");
check(!/completed/.test(TS.toCard("Ship 42 completed two cryo tests.", { confirmed: false })), "nothing unconfirmed says 'completed'");
check(/deployed/.test(TS.toCard("Ship 42 released 10 Starlink sims.")) && !/releas/i.test(TS.toCard("Ship 42 released 10 Starlink sims.")), "'released' → 'deployed'");
check(TS.toCard("Test flight mission: Flight 15 suborbital.") === null, "no 'Test flight mission' line");
check(TS.toCard("Booster 22 is being lifted onto Pad 2.") === "Booster 22 was lifted onto Pad 2.", "present tense card row → past tense");
check(TS.lint({ card_text: "Ship 42 completed a cryo test." }, { confirmed: false }).length > 0, "lint flags unconfirmed 'completed'");
check(TS.lint({ push_text: "Satellites released." }).length > 0, "lint flags 'released'");
const pr = TS.pairFrom({ text: FROST, push_text: FROST, card_text: "Ship 42 completed another cryo test." }, { confirmed: false });
check(pr.push_text === FROST && pr.card_text === "Ship 42 likely ran another cryo test.", "pairFrom repairs an unconfirmed writer card_text");
check(TS.cardText({ text: "old" }) === "old" && TS.pushText({ text: "old" }) === "old", "old rows fall back to text");
// writer schema + prompts
const req = XF.CLASSIFY_SCHEMA.properties.entries.items.required;
check(req.includes("push_text") && req.includes("card_text"), "X-first schema asks for push_text and card_text");
const road = JSON.parse(fs.readFileSync(path.join(root, "road.json"), "utf8"));
const cp = XF.classifyPrompt(road, [], [{ id: "cryo", name: "Cryo" }]), bp = CR.buildPrompt(road, []);
for (const [n, p] of [["classify", cp], ["road", bp]]) check(/push_text/.test(p) && /card_text/.test(p) && /likely ran/.test(p) && /never "released"/.test(p) && /Test flight mission/.test(p), `${n} prompt carries the split rules`);
// journey: frost → likely pair; confirming post → completed card
const st = { ...J.blank(), location: "Massey's", done: { cryo: 1, static: 0 }, engines: false };
const r1 = J.step(st, "Frost on both tanks of S42 at Massey's", { v: "S42", id: "L1", at: "2026-10-09T20:30:41Z" });
check(r1.push_text === FROST && r1.card_text === "Ship 42 likely ran another cryo test.", "journey frost line: push live, card 'likely ran'");
const rd = { categories: [{ id: "cryo", history: [{ id: "H", updates: [{ id: "L1", text: FROST, push_text: FROST, card_text: r1.card_text, likely: true }] }] }] };
const r2 = J.step(r1.state, "S42 cryo test complete at Massey's", { v: "S42", at: "2026-10-10T08:00:00Z" });
check(r2.confirms === "L1", "confirming post points at the likely line");
J.confirmLine(rd, r2.confirms, r2.text, "https://x.com/a/status/1", "@a");
const u = rd.categories[0].history[0].updates[0];
check(u.card_text === "Ship 42 completed another cryo test." && !u.likely, "confirm sets card_text to the completed form");
// push wiring
const box = { id: "cryo", icon: "❄️", name: "Cryo tests", status: "progress" };
const n = CR.notificationFor({ flight: 15 }, { box, entry: { text: "x", log_text: "log", push_text: FROST, card_text: "c", flight: 15 }, from: "progress", to: "progress" });
check(n.body === FROST, "push body reads push_text");
const n2 = CR.notificationFor({ flight: 15 }, { box, entry: { text: "old line", flight: 15 }, from: "progress", to: "progress" });
check(n2.body === "old line", "push falls back to text for old rows");
// card wiring
const app = fs.readFileSync(path.join(root, "app.js"), "utf8"), fl = fs.readFileSync(path.join(__dirname, "flightlog.js"), "utf8");
check(/const cardT = \(o\) => \(o && \(o\.card_text \|\| o\.text\)\)/.test(app) && !/scrub\(u\.text\)/.test(app), "app.js cards read card_text, fallback text");
check(/h\.log_text \|\| h\.card_text \|\| h\.text/.test(fl), "flightlog reads log_text, then card_text, then text");
// data
const rows = road.categories.flatMap((c) => (c.history || []).flatMap((h) => [h, ...(h.updates || [])]));
const s42 = rows.find((r) => r.at === "2026-10-09T20:30:41.000Z" && /Ship 42/.test(r.text));
check(s42 && s42.push_text === FROST && s42.card_text === "Ship 42 likely ran another cryo test.", "S42 Cryo 9 Oct row backfilled");
check(rows.every((r) => !r.card_text || !(r.likely || r.trust === "unconfirmed") || !/completed/.test(r.card_text)), "no unconfirmed card_text says 'completed'");
check(rows.every((r) => !/releas(e|ed)\b/i.test(r.card_text || "") && !/^frost on/i.test(r.card_text || "")), "backfilled card_text clean");
check(require("./backfill-text-split.js").backfill(JSON.parse(JSON.stringify(road))).length === 0, "backfill is idempotent");
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
