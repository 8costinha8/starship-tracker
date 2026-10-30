/* One-off push of an existing Updates feed item (manual workflow_dispatch input send_push = feed item id).
   Sends through push-sync sendPush: visible check, push policy dedupe + history, shadow OFF. Logs to notifications.json.
     node scripts/send-oneoff.js <feed-item-id>      (needs FIREBASE_SERVICE_ACCOUNT; commits + pushes the log on CI) */
const fs = require("fs"), path = require("path"), { execSync } = require("child_process");
const ps = require("./push-sync.js");
const ROOT = path.join(__dirname, "..");
function buildPush(road, id) {
  const f = (road.feed_items || []).find((x) => x.id === id);
  if (!f) throw new Error(`feed item not found: ${id}`);
  return { title: f.title, body: f.body, at: f.at, ...(f.url ? { url: f.url } : {}), link: `${ps.SITE}?feed=1&item=${encodeURIComponent(f.id)}`, kind: f.kind || "news", visible: { where: "feed", id: f.id } };
}
async function sendOneoff(id, { road, logPath, send, save = true, log = console.log, now = Date.now }) {
  const n = buildPush(road, id);
  const rows = [];
  const row = await ps.sendPush(n, { road, send, save, logRows: rows, history: ps.readLog(logPath).pushes, shadow: false, log, now });
  if (save) ps.writeLog(logPath, rows);
  return row;
}
if (require.main === module) {
  (async () => {
    const id = String(process.argv[2] || process.env.SEND_PUSH_ID || "").trim();
    if (!id) throw new Error("no feed item id");
    const road = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
    const logPath = path.join(ROOT, "notifications.json");
    const send = require("./check-road.js").firebaseDeps().push;
    const row = await sendOneoff(id, { road, logPath, send });
    console.log(`one-off push ${id}: ${row.verdict}`);
    const run = (c) => execSync(c, { cwd: ROOT, stdio: "pipe" });
    run('git config user.name "Starship Tracker Bot"'); run('git config user.email "actions@github.com"');
    run("git add notifications.json"); run(`git commit -m "Auto: push log — one-off ${id} (${row.verdict.split(":")[0]})"`);
    for (let i = 0; i < 3; i++) { try { run("git pull --rebase --quiet"); run("git push"); break; } catch (e) { if (i === 2) throw e; } }
    if (row.verdict !== "sent") process.exit(1);
  })().catch((e) => { console.error("one-off push failed:", e.message); process.exit(1); });
}
module.exports = { buildPush, sendOneoff };
