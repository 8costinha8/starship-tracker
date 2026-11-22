// Push guards: replay of the last-10 audit, idempotency, live-flight pass-through, and a launch-critical-never-lost replay. Offline, fake data only.
const fs = require("fs"), path = require("path");
const G = require("./push-guards.js");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "push-audit-22nov.json"), "utf8"));
process.env.PUSH_GUARDS = "on";

console.log("audit of the last 10 pushes (Flight 16 current, B23 + S43) — Scripto's verdicts: 7 correct, 3 wrong (#4, #5, #8):");
const expect = { 1: "allow", 2: "allow", 3: "allow", 4: "G5", 5: "G2", 6: "allow", 7: "allow", 8: "G2", 9: "allow", 10: "allow" };
const advise = {}; // what the ADVISORY rules would say (only enforced with PUSH_GUARDS=strict)
for (const c of fx.cases) {
  const r = c.push, v = G.evaluate({ ...r, source_text: c.source_text }, { history: fx.history, now: Date.parse(r.sent_at), road: fx.road });
  advise[c.n] = v.action === "allow" && v.rule ? v.rule : "";
  const res = v.action === "silent" ? v.rule : "allow";
  ok(res === expect[c.n], `#${c.n} "${r.title}" / "${r.body.slice(0, 50)}" → ${v.action === "silent" ? "silent " + v.rule + " (" + v.reason + ")" : "send" + (v.rule ? ` (advisory ${v.rule})` : "")}`);
}
ok(fx.cases.filter((c) => expect[c.n] === "allow").length === 7, "the 7 correct pushes (1 2 3 6 7 9 10) still send");
process.env.PUSH_GUARDS = "strict";
const strictSilenced = fx.cases.filter((c) => G.evaluate({ ...c.push, source_text: c.source_text }, { history: fx.history, now: Date.parse(c.push.sent_at), road: fx.road }).action === "silent").map((c) => c.n);
ok([3, 6, 7, 9, 10].every((n) => strictSilenced.includes(n)), `PUSH_GUARDS=strict (taste calls: not-this-flight, night, old-flight) would also hold ${strictSilenced.filter((n) => expect[n] === "allow").join(", ")} — off by default`);
process.env.PUSH_GUARDS = "on";

console.log("\nidempotency:");
const base = { title: "🚀 Starship", body: "Ship 43 stacked on Booster 23.", url: "https://x.com/SpaceX/status/2999000000000000001", at: "2026-11-25T10:00:00Z" };
const ctx = (h, t = "2026-11-25T10:05:00Z") => ({ history: h, now: Date.parse(t), road: { flight: 16, vehicles: ["B23", "S43"] } });
const row = (o) => ({ verdict: "sent", sent_at: "2026-11-25T10:01:00Z", ...o });
ok(G.evaluate(base, ctx([])).action === "allow", "fresh milestone of the current flight → allow");
ok(G.evaluate({ ...base, body: "Both vehicles are stacked." }, ctx([row({ url: base.url, title: "x", body: "y" })])).rule === "G1", "same source post, different channel/wording → G1");
ok(G.evaluate(base, ctx([row({ title: base.title, body: base.body, url: "" })])).rule === "G1", "identical title+body within 24h → G1");
ok(G.evaluate({ ...base, url: "https://x.com/B/status/2999000000000000009", body: "S43 has stacked on B23!" }, ctx([row({ key: "S43|stacking|25 Nov", title: "t", body: "b" })])).rule === "G1", "same vehicle + event within 15 min → G1");
ok(G.evaluate(base, ctx([row({ url: base.url, title: "🚀 Starship (unconfirmed)", body: "?" })])).action === "allow", "unconfirmed → confirmed is an upgrade, not a duplicate");
ok(G.evaluate(base, ctx([row({ url: base.url, sent_at: "2026-11-20T10:00:00Z", title: "t", body: "b" })])).action === "allow", "same url 5 days later is outside the 72h window");
ok(G.evaluate(base, ctx([row({ url: base.url, verdict: "silent: minor", title: "t", body: "b" })])).action === "allow", "a silent / blocked row is not a push, so no G1");

console.log("\na real Flight 16 day still pushes:");
const liftoff = row({ title: "🚀 Liftoff!", body: "Flight 16 is in the air · Watch now", sent_at: "2026-11-25T10:00:00Z", url: "" });
const live = (b, h = [liftoff], t = "2026-11-25T10:09:00Z", extra = {}) => G.evaluate({ title: "🚀 Starship", body: b, url: "https://x.com/SpaceX/status/2999000000000000" + Math.floor(Math.random() * 900 + 100), at: "2026-11-25T10:07:00Z", ...extra }, ctx(h, t));
ok(live("Super Heavy booster caught by the tower.").action === "allow", "booster catch after liftoff → allow");
ok(live("Starship splashed down in the Indian Ocean.").action === "allow", "ship splashdown after liftoff → allow");
ok(G.evaluate({ title: "🚧 Launch delayed", body: "Now 3 Dec, 01:00", url: "", at: "2026-11-25T10:00:00Z" }, ctx([])).action === "allow", "internal date push → allow");
ok(G.evaluate({ title: "📡 Livestream ready", body: "Liftoff in 60 min - tap to watch", url: "", at: "2026-11-25T10:00:00Z" }, ctx([])).action === "allow", "T-60 livestream → allow");
ok(G.evaluate({ title: "Road to Flight 17", body: "Flight 17 hardware starts here.", url: "", at: "2026-11-25T10:00:00Z" }, ctx([])).action === "allow", "Road to Flight N → allow");
ok(G.evaluate({ title: "🚀 Starship", body: "Booster 23 static fire complete.", url: "https://x.com/SpaceX/status/2999000000000000777", at: "2026-11-25T10:00:00Z" }, ctx([], "2026-11-25T10:20:00Z")).action === "allow", "current-flight static fire (daytime) → allow");
ok(G.evaluate({ title: "🚀 Starship", body: "Booster 23 static fire complete.", url: "https://x.com/SpaceX/status/2999000000000000778", at: "2026-11-25T10:00:00Z" }, ctx([], "2026-11-25T17:30:00Z")).rule === "G2", "…but the same post 7.5 h later is stale (G2)");

console.log("\nmodes:");
process.env.PUSH_GUARDS = "warn"; const w = G.evaluate({ ...fx.cases[6].push, source_text: fx.cases[6].source_text }, { history: fx.history, now: Date.parse(fx.cases[6].push.sent_at), road: fx.road });
ok(w.action === "allow" && w.would === "silent" && !!w.rule, "warn mode: not silenced, but the row says what it would have done");
process.env.PUSH_GUARDS = "off"; ok(G.evaluate({ ...fx.cases[6].push }, { history: fx.history, now: Date.parse(fx.cases[6].push.sent_at), road: fx.road }).action === "allow", "off mode: allow");
process.env.PUSH_GUARDS = "on";

console.log("\nreplay of every logged push (what the guards would have changed):");
const notif = path.join(__dirname, "..", "notifications.json");
if (fs.existsSync(notif)) {
  const all = JSON.parse(fs.readFileSync(notif, "utf8")).pushes.filter((r) => /^sent/.test(r.verdict) && r.at && r.sent_at);
  const seq = [], silenced = [];
  const ts = all.map((r) => Date.parse(r.sent_at)).sort((a, b) => a - b);
  for (const r of all) {
    const f = Date.parse(r.sent_at) < Date.parse("2026-11-14T21:31:00Z") ? 15 : 16;
    const v = G.evaluate(r, { history: seq, now: Date.parse(r.sent_at), road: { flight: f, vehicles: f === 16 ? ["B23", "S43"] : [] } });
    if (v.action === "silent") silenced.push({ r, v }); else seq.push(r);
  }
  const crit = silenced.filter((x) => !/^https?:\/\/(?:x|twitter)\.com/.test(x.r.url || "") && /Liftoff|delayed|time confirmed|New estimated|Livestream|Ship caught|Booster caught|Flight \d+ —|Deorbit|Road to Flight/i.test(x.r.title));
  console.log(`    ${all.length} sent pushes in the log → ${silenced.length} would have stayed in-app, ${all.length - silenced.length} still push; by rule: ` + JSON.stringify(silenced.reduce((a, x) => (a[x.v.rule] = (a[x.v.rule] || 0) + 1, a), {})));
  for (const x of crit) console.log("    !! critical silenced: " + x.r.title + " — " + x.v.reason);
  ok(crit.length === 0, "no internal launch-critical push (liftoff, date, livestream, catch, result, Road to Flight) would be silenced");
  const nonXcrit = all.filter((r) => /Liftoff/i.test(r.title)).length;
  ok(silenced.every((x) => !/Liftoff!?$/.test(x.r.title)), `every logged Liftoff push (${nonXcrit}) survives`);
  fs.mkdirSync(path.join(__dirname, "..", "data"), { recursive: true });
  if (process.env.GUARD_REPLAY_OUT) fs.writeFileSync(process.env.GUARD_REPLAY_OUT, JSON.stringify({ total: all.length, silenced: silenced.map((x) => ({ at: x.r.sent_at, title: x.r.title, body: x.r.body, rule: x.v.rule, reason: x.v.reason })) }, null, 1));
}
console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
