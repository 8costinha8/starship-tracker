// sendPush with the guards, the write-through log and the commit retry. Fake send only: nothing real is sent, nothing leaves the temp dir.
process.env.PUSH_SHADOW = "0"; process.env.PUSH_GUARDS = "on";
const fs = require("fs"), os = require("os"), path = require("path");
const ps = require("./push-sync.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
const NOW = Date.parse("2026-11-22T14:00:00Z");
const road = { flight: 16, vehicles: ["B23", "S43"], categories: [], feed_items: [], mission_updates: {}, mission_alerts: { flight: 16, liftoff_actual: null } };
const mk = (body, url, at, extra = {}) => ps.addFeedItem(road, { title: "🚀 Starship", body, url, at, kind: "news", ...extra });
(async () => {
  const sent = [], send = async (n) => sent.push(n), quiet = () => {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "psg-")), logPath = path.join(tmp, "notifications.json");
  const rows = [], onRow = (r) => ps.appendLogRow(logPath, r);
  const n1 = mk("Booster 23 static fire complete.", "https://x.com/SpaceX/status/2999000000000000101", "2026-11-22T13:40:00Z");
  let r = await ps.sendPush(n1, { road, send, logRows: rows, log: quiet, now: () => NOW, history: [], onRow });
  ok(r.verdict === "sent" && sent.length === 1, "a normal current-flight milestone sends (fake sender)");
  ok(ps.readLog(logPath).pushes.length === 1 && ps.readLog(logPath).pushes[0].verdict === "sent", "its log row is on disk right after the send (write-through), before the end-of-run write");
  ps.writeLog(logPath, rows);
  ok(ps.readLog(logPath).pushes.length === 1, "the end-of-run writeLog does not write the row a second time");
  // same post again through another channel
  const n2 = ps.addFeedItem(road, { title: "Flight 16 update", body: "Booster 23 passed its static fire.", url: n1.url, at: "2026-11-22T13:40:00Z", kind: "mission", flight: 16 });
  r = await ps.sendPush(n2, { road, send, logRows: rows, log: quiet, now: () => NOW + 120000, history: ps.readLog(logPath).pushes, onRow });
  ok(/^silent: guard G1/.test(r.verdict) && sent.length === 1, `same post, second channel → ${r.verdict}`);
  // recap by an official account
  const n3 = mk("Starbase tower chopsticks caught their first Starship.", "https://x.com/SpaceX/status/2999000000000000102", "2026-11-22T13:50:00Z", { source_text: "The Starbase tower chopsticks catching their first Starship." });
  r = await ps.sendPush({ ...n3, source_text: "The Starbase tower chopsticks catching their first Starship." }, { road, send, logRows: rows, log: quiet, now: () => NOW + 300000, history: ps.readLog(logPath).pushes, onRow });
  ok(/^silent: guard G2/.test(r.verdict) && sent.length === 1, `recap → ${r.verdict}`);
  // warn mode
  process.env.PUSH_GUARDS = "warn";
  const n4 = mk("Starbase tower chopsticks caught their first Starship!", "https://x.com/SpaceX/status/2999000000000000103", "2026-11-22T13:55:00Z");
  r = await ps.sendPush({ ...n4, source_text: "The Starbase tower chopsticks catching their first Starship." }, { road, send, logRows: rows, log: quiet, now: () => NOW + 360000, history: [], onRow });
  ok(!/guard/.test(r.verdict) && /G2 \(warn\)/.test(r.guard || ""), `warn mode: not silenced, row.guard = "${r.guard}"`);
  process.env.PUSH_GUARDS = "on";
  // a crash after sending: rows already on disk
  ok(ps.readLog(logPath).pushes.length === rows.filter((x) => x._written).length, "every row produced so far is already in the file (a crash here loses nothing)");
  // the commit retry is in check-road
  const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
  ok(/push log commit failed \(try \$\{attempt\}\/3\)/.test(cr) && /onRow: save \? \(r\) => pushSync\.appendLogRow\(notifLogPath, r\) : null/.test(cr), "check-road: write-through on both send paths + notifications.json commit retried 3×");
  console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
