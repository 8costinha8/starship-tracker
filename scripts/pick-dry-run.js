/* Dry run of the automatic picture picker against the current Road entries. Writes NOTHING
   (no road.json, no road-media.json, no pushes). Needs X_BEARER_TOKEN + XAI_API_KEY (or
   ANTHROPIC_API_KEY) in the environment, e.g. a test_mode workflow run. Manual picks are
   ignored here so every entry is tried; the comparison file is optional.
     node scripts/pick-dry-run.js [picks.json]                               */
const fs = require("fs"), path = require("path");
const road = require("./check-road.js");
(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "road.json"), "utf8"));
  const manual = process.argv[2] && fs.existsSync(process.argv[2]) ? (((j) => Array.isArray(j) ? j : j.picks)(JSON.parse(fs.readFileSync(process.argv[2], "utf8")))) : [];
  let calls = 0, read = 0; const rows = [];
  for (const c of data.categories) {
    if (c.id === "date") continue;
    for (const h of c.history || []) {
      if (h.kind === "check") continue;
      const r = await road.autoPick(h, c, { token: process.env.X_BEARER_TOKEN, log: () => {} });
      calls += r.calls; read += r.read;
      const m = manual.find((x) => x.category === c.id && (x.entry_date || x.date) === h.date);
      rows.push({ cat: c.id, date: h.date, text: (h.x_text || h.text).slice(0, 70), step: r.step, pick: r.pick ? `@${r.pick.author} ${r.pick.post_id} ${r.pick.media_type}` : "none", image: r.pick ? r.pick.media_url : "", why: r.why, manual: m ? `${m.author} ${m.post_id}` : "", same_post: !!(m && r.pick && m.post_id === r.pick.post_id) });
      console.log(`PICK ${c.id} ${h.date} | ${rows[rows.length - 1].pick} | ${r.why}`);
    }
  }
  console.log(`PICK SUMMARY: ${rows.length} entries, step0 ${rows.filter((r) => r.step === "source" && r.pick !== "none").length}, search ${rows.filter((r) => r.step === "search" && r.pick !== "none").length}, none ${rows.filter((r) => r.pick === "none").length}; X calls ${calls}, posts read ${read}; same post as manual ${rows.filter((r) => r.same_post).length}`);
  console.log("PICK JSON " + Buffer.from(JSON.stringify(rows)).toString("base64"));
})();
