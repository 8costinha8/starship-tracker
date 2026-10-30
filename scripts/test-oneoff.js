/* Offline: send-oneoff.js finds the feed item and sends it once (fake sender, temp log, no network). node scripts/test-oneoff.js */
const fs = require("fs"), os = require("os"), path = require("path");
const O = require("./send-oneoff.js");
let failed = 0; const check = (ok, m) => { console.log(`${ok ? "✅" : "❌"} ${m}`); if (!ok) failed++; };
(async () => {
  const road = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
  const id = "launch_date-mvv5rls0-69f74f";
  const logPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "oneoff-")), "n.json");
  fs.writeFileSync(logPath, JSON.stringify({ pushes: [] }));
  const sent = []; const send = async (n) => sent.push(n);
  const n = O.buildPush(road, id);
  check(n.body === "Flight 15 now NET 12 Nov (was 8 Nov) · unofficial" && /item=launch_date-/.test(n.link), "builds the slip push from the feed item");
  const now = () => Date.parse("2026-10-30T16:30:00Z");
  const r1 = await O.sendOneoff(id, { road, logPath, send, log: () => {}, now });
  check(r1.verdict === "sent" && sent.length === 1, `first send: ${r1.verdict}`);
  const r2 = await O.sendOneoff(id, { road, logPath, send, log: () => {}, now });
  check(r2.verdict !== "sent" && sent.length === 1, `second send deduped: ${r2.verdict}`);
  check(JSON.parse(fs.readFileSync(logPath)).pushes.filter((p) => p.verdict === "sent").length === 1, "log has exactly one sent row");
  let threw = false; try { O.buildPush(road, "nope"); } catch { threw = true; } check(threw, "unknown id throws");
  process.exit(failed ? 1 : 0);
})();
