/* 1 Nov data round (data only; logic lives in purpose.js / journey.js / summary-scope.js / app.js). Idempotent.
   1) real photos for the two placeholder Pad cards (X post photo first; the Blobifie post has only videos → its
      chopsticks thumbnail). No keep_image: the normal picker may still upgrade them.
   2) Raptor · B22: the lifting-jig prep line is refiled to the B22 journey (static) by purpose.refile(); the Raptor card
      line becomes the completion ("Booster 22 was ready with all 33 Raptors.").
   3) Cryo · S42 card line = the pinned Flight Log wording.
   5) Pad · B22 feed body gets its full stop (push_text kept).
   6) static status → done; 29 Oct RGVaerialphotos row card_text (push_text untouched); no ' / ' in the summary.
   7) Pad log_latest only from Flight 15's vehicles (summary-scope.js).
   8) journeys recounted from confirmed events (journey-replay with the event counter); needs-review items cleared.
   Usage: node scripts/backfill-2026-11-01.js [--dry] */
const fs = require("fs"), path = require("path");
const P = require("./purpose.js"), SC = require("./summary-scope.js"), JR = require("./journey-replay.js"), C = require("./cleanup.js");
const ROOT = path.join(__dirname, "..");
const PHOTOS = {
  "s42-pad2-sep": { post_url: "https://x.com/TrackingTheSB/status/2098798758335225974", post_id: "2098798758335225974", author: "TrackingTheSB", type: "photo", image: "https://pbs.twimg.com/media/HSBuEQiaYAAIOHV.jpg", fixed: "2026-11-01 own X post photo (was placeholder)" },
  "x-2112967167767433728-pad": { post_url: "https://x.com/Blobifie/status/2112679319818686934", post_id: "2112679319818686934", author: "Blobifie", type: "video", image: "https://pbs.twimg.com/amplify_video_thumb/2112678295435464704/img/9a4tS6nMnzIHT1_6.jpg", fixed: "2026-11-01 own X post (videos only: chopsticks thumbnail; was placeholder)" },
};
function apply(road, needs, { log = console.log } = {}) {
  const out = []; const ch = (w, a, b) => { out.push({ where: w, before: a, after: b }); log(`FIX ${w} | ${JSON.stringify(a)} → ${JSON.stringify(b)}`); };
  const cat = (id) => road.categories.find((c) => c.id === id);
  // 1
  for (const c of road.categories) for (const h of c.history || []) if (PHOTOS[h.id] && !h.media_override) { h.media_override = { ...PHOTOS[h.id] }; ch(`${c.id} ${h.id} media_override`, null, h.media_override.image); }
  // 2 (refile: the jig line → static, its completion rows stay in raptor as their own entry)
  for (const m of P.refile(road)) ch(`refile ${m.id}`, m.from, m.to);
  const rap = (cat("raptor").history || []).find((h) => h.split_from === "x-2113834862339617215");
  if (rap && rap.card_text !== "Booster 22 was ready with all 33 Raptors.") { ch(`raptor ${rap.id} card_text`, rap.card_text || rap.text, "Booster 22 was ready with all 33 Raptors."); rap.card_text = "Booster 22 was ready with all 33 Raptors."; rap.hardware = rap.hardware || "B22"; rap.flight = rap.flight || road.flight; rap.refiled_pin = true; }
  // the completion card keeps the B22 engine photo the old Raptor card showed (RGVaerialphotos, Megabay 1), credited
  if (rap && !rap.media_override) { rap.media_override = { post_url: "https://x.com/RGVaerialphotos/status/2113834862339617215", post_id: "2113834862339617215", author: "RGVaerialphotos", type: "photo", image: "https://pbs.twimg.com/media/HVXY5SCacAADfbX.jpg", credit_only: true, fixed: "2026-11-01 B22 engine photo carried over from the refiled jig card" }; ch(`raptor ${rap.id} media_override`, null, rap.media_override.image); }
  // the jig line is B22 journey context: Pad activity · Booster 22 (its move/prep card). Not Static fires: that section
  // already holds 11 entries and x-first caps a section at 12, so a new static card would push it out. Same id → deep
  // link, push record and post dedupe kept.
  for (const c of road.categories) { if (c.id === "pad") continue; const i = (c.history || []).findIndex((h) => h.id === "x-2113834862339617215");
    if (i >= 0) { const [jig] = c.history.splice(i, 1); Object.assign(jig, { refiled_pin: true, refiled_from: "raptor", stage: "pad", journey_context: "engine prep (1 Nov: not a Raptor milestone)" });
      const pad = cat("pad"); pad.history = [...pad.history, jig].sort((a, b) => C.dayNum(b) - C.dayNum(a) || (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0)); ch("move x-2113834862339617215", c.id, "pad (B22 journey context)"); } }
  if (rap) { const r = cat("raptor"); if (r.latest !== "Booster 22 was ready with all 33 Raptors.") { ch("raptor latest/log_latest", [r.latest, r.log_latest], ["Booster 22 was ready with all 33 Raptors.", "Booster 22 ready with all 33 Raptors."]); r.latest = "Booster 22 was ready with all 33 Raptors."; r.log_latest = "Booster 22 ready with all 33 Raptors."; } }
  // 3
  const cryo = (cat("cryo").history || []).find((h) => h.url === "https://x.com/LabPadre/status/2108486994401825101");
  const PIN3 = "Ship 42 completed its third cryo proof test.";
  if (cryo && cryo.card_text !== PIN3) { ch("cryo S42 card_text", cryo.card_text || cryo.text, PIN3); cryo.card_text = PIN3; }
  if (cat("cryo").latest !== PIN3) { ch("cryo latest", cat("cryo").latest, PIN3); cat("cryo").latest = PIN3; }
  // 5
  // (render-check now flags a missing full stop: every news body gets one; push wording kept, launch_date items untouched)
  const END = /[.!?…)"”']$/;
  for (const f of road.feed_items || []) if (f && f.kind === "news" && f.body && !f.later_flight && !END.test(f.body.trim())) { if (!f.push_text) f.push_text = f.body; ch(`feed ${f.id} body`, f.body, f.body.trim() + "."); f.body = f.body.trim() + "."; }
  for (const c of road.categories) if (["cryo", "raptor", "static", "pad"].includes(c.id)) for (const h of c.history || []) for (const x of [h, ...(h.updates || [])]) {
    const shown = x.card_text || x.x_text || x.text; if (shown && shown.split(/\s+/).length >= 4 && !END.test(shown.trim())) { ch(`${c.id} ${h.id || ""}${x === h ? "" : " › " + (x.date || x.at)} card_text`, shown, shown.trim() + "."); x.card_text = shown.trim() + "."; } }
  // 6
  const st = cat("static"); if (st.status !== "done") { ch("static status", st.status, "done"); st.status = "done"; }
  const ROW = "Ship 42 returned to Megabay 2 after its static fires.";
  const top = (st.history || []).find((h) => h.id === "x-2115701002095755563");
  if (top && top.card_text !== ROW) { ch("static x-2115701002095755563 card_text", top.card_text, ROW); top.card_text = ROW; }
  if (/ \/ /.test(st.latest || "")) { ch("static latest", st.latest, ROW); st.latest = ROW; }
  // 7
  for (const c of road.categories) {
    if (!["cryo", "raptor", "static", "pad"].includes(c.id)) continue;
    if (SC.named(c.log_latest).some((v) => !(road.vehicles || []).includes(v)) || SC.named(c.latest).some((v) => !(road.vehicles || []).includes(v))) {
      const n = (c.history || []).find((x) => x.kind !== "check" && x.trust !== "unconfirmed" && SC.inScope(road, x));
      if (n) { const shown = n.card_text || n.text; const nl = n.status_line || C.shortLine(n.log_text || n.text); ch(`${c.id} latest/log_latest`, [c.latest, c.log_latest], [shown, nl]); c.latest = shown; c.log_latest = nl; }
    }
  }
  // 8
  for (const v of road.vehicles || []) {
    const res = JR.replay(road, v), j = road.journeys[v];
    const done = { ...j.done, ...res.state.done };
    if (JSON.stringify(done) !== JSON.stringify(j.done)) { ch(`journeys.${v}.done`, j.done, done); j.done = done; }
    j.counted = res.state.counted; if (res.state.last_test) j.last_test = res.state.last_test;
    j.count_note = "1 Nov: recounted from confirmed events (recaps, repeats and same-event posts add 0)";
  }
  if (needs) {
    const before = needs.items.length;
    needs.items = needs.items.filter((x) => !(x.type === "journey" && /^B22: journey cryo count/.test(x.msg || "")) && !(x.item === "news-mvsb9c8o-97f884"));
    if (needs.items.length !== before) ch("needs-review", before, needs.items.length);
  }
  return out;
}
module.exports = { apply, PHOTOS };
if (require.main === module) {
  const f = path.join(ROOT, "road.json"), nf = path.join(ROOT, "data", "needs-review.json");
  const road = JSON.parse(fs.readFileSync(f, "utf8")), needs = JSON.parse(fs.readFileSync(nf, "utf8"));
  const r = apply(road, needs);
  if (!process.argv.includes("--dry")) { fs.writeFileSync(f, JSON.stringify(road, null, 2) + "\n"); fs.writeFileSync(nf, JSON.stringify(needs, null, 2) + "\n"); }
  console.log(`\n${r.length} changes${process.argv.includes("--dry") ? " (dry run)" : ""}`);
}
