/* One-off render-fix backfill (31 Oct 2026, 16:20 UK live check). The first backfill (f30e817) wrote card_text, but several
   rendered fields come from elsewhere:
     - Flight Log boxes (main page): scripts/flightlog.js → road.flightlog_pins lines (day/time/text) + status rules
     - Road to Flight cards: card_text || x_text || text of the main entry; header time = completed_at (done cards) || at
     - Earlier-updates rows: card_text || text of updates; feed_items filed to a box render f.body at f.at (no card_text)
     - Launch date cards: only categories.date history + feed_items with box "date" (other feed kinds are not shown)
   This script fixes those fields. Wording / metadata / routing only: no pushes, no milestones, no media, no link dropped
   (a removed duplicate row keeps its url in also_posts; a feed item's original push wording is kept in push_text).
   Idempotent. Usage: node scripts/backfill-2026-10-31-render.js [--dry] */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
function apply(road, { log = console.log } = {}) {
  const changes = [], review = [];
  const ch = (what, before, after) => { changes.push({ what, before, after }); log(`FIX ${what}${before !== undefined ? ` | ${JSON.stringify(before)} → ${JSON.stringify(after)}` : ""}`); };
  const cat = (id) => road.categories.find((c) => c.id === id);
  const feed = (id) => (road.feed_items || []).find((f) => f.id === id);
  const pins = road.flightlog_pins && road.flightlog_pins.boxes;
  const pinCard = (box, v) => ((pins[box] || {}).cards || []).find((k) => k.vehicle === v);
  const past = (f, body) => { if (!f || f.body === body) return; if (!f.push_text) f.push_text = f.body; const b = f.body; f.body = body; ch(`feed ${f.id} body (past tense; push wording kept in push_text)`, b, body); };

  // 1. Launch date: the 30 Oct NET 12 Nov item is a Launch date card; the 14 Oct NET 8 Nov card is superseded
  const slip = feed("launch_date-mvv5rls0-69f74f");
  if (slip && slip.box !== "date") { slip.box = "date"; ch("feed launch_date-mvv5rls0-69f74f filed to the Launch date box (NET 12 Nov shows as the newest date card)"); }
  const d14 = (cat("date").history || []).find((h) => /NET 8 November/.test(h.text || "") && h.flight === 15);
  if (d14 && !d14.superseded) {
    d14.superseded = { by: "launch_date-mvv5rls0-69f74f", date: "30 Oct", why: "FAA planning slide · NSF, 30 Oct: Flight 15 NET 12 Nov (was 8 Nov)" };
    const b = d14.card_text || d14.text; d14.card_text = "Flight 15 was targeting NET 8 November (since moved to NET 12 Nov), with plans to catch both vehicles."; ch("date 14 Oct card superseded", b, d14.card_text);
  }
  const slipNews = feed("news-mvtv609c-f58a18"); past(slipNews, "Flight 15 reportedly slipped by four days to 12 November");

  // 2. S42 static fire: one event time, 27 Oct 21:45 UK (NSF tier-1 post of the six-engine firing). The card's
  //    completed_at was NSF's 28 Oct 11:25 recap post; SpaceX's 28 Oct 16:10 post is the official recap of the same test.
  const st = cat("static"), s42sf = st.history.find((h) => h.id === "x-2114904512217694216");
  const EV = "2026-10-27T21:45:25.000Z";
  if (s42sf && s42sf.completed_at !== EV) { const b = s42sf.completed_at; s42sf.completed_at = EV; s42sf.completed_at_note = "27 Oct 21:45 UK: NSF (tier 1) post showing the six-engine firing; 28 Oct 11:25 was NSF's recap post, 28 Oct 16:10 SpaceX's recap"; ch("static S42 completed_at", b, EV); }
  const sx = feed("news-mvsb9c8o-97f884");
  if (sx) {
    past(sx, "Ship 42 completed a full-duration six-engine static fire and deorbit burn simulation");
    if (sx.event_at !== EV) { sx.event_at = EV; sx.event_card = "x-2114904512217694216"; ch("feed news-mvsb9c8o-97f884 event_at (event time, post time kept in at)", undefined, EV); }
    // its Earlier-updates row would show the post time (28 Oct 16:10): un-file it and keep the post as a row on the S42 card at the event time
    if (sx.box || !sx.refiled_pin) { sx.refiled_pin = true; if (sx.box) sx.rerouted = { from: sx.box, why: "official recap of the 27 Oct six-engine static fire; kept on the Ship 42 static fire card (also_posts) at the event time" }; delete sx.box; ch("feed news-mvsb9c8o-97f884 un-filed (refiled_pin: the purpose re-file leaves it) from the static box (row lives on the S42 card)"); }
    // same firing as the card's "fired all 6 Raptors" row (NSF 27 Oct 21:45): kept as a linked source, not a second row
    s42sf.also_posts = s42sf.also_posts || [];
    if (!s42sf.also_posts.some((x) => x.url === sx.url)) { s42sf.also_posts.push({ url: sx.url, src: "@SpaceX", at: sx.at, event_at: EV, text: "Ship 42 completed a full-duration six-engine static fire and deorbit burn simulation.", why: "SpaceX (tier 1) recap of the 27 Oct 21:45 six-engine firing" }); ch("static S42 card: SpaceX recap kept as also_posts (same event, no duplicate row)"); }
  }

  // 3. S42 pad: 12 Sep, and the status matches the line (a pad test completed → In progress)
  const padS = pinCard("pad", "S42");
  if (padS) {
    const rel = padS.lines.findIndex((l) => /released from the Pad 2 chopsticks/.test(l.text));
    if (rel >= 0) {
      const l = padS.lines.splice(rel, 1)[0]; ch("pin pad S42: 13 Sep release line removed from the Flight Log card (kept as a row on the 12 Sep card)", l.text, null);
      const h7 = cat("pad").history.find((h) => h.id === "s42-pad2-sep");
      if (h7 && !(h7.updates || []).some((u) => u.url === l.url)) h7.updates.push({ date: "13 Sep", at: l.at.replace("Z", ".000Z"), text: "Ship 42 was deployed from the Pad 2 chopsticks after its tests.", url: l.url, src: "@NASASpaceflight", handle: "NASASpaceflight", phase: "completed", tier: 1 });
    }
    const top = padS.lines.find((l) => /^Chopsticks lifted Ship 42 to catch height/.test(l.text));
    const T = "Ship 42 completed catch-height and quick-disconnect arm tests with the Pad 2 chopsticks.";
    if (top && top.text !== T) { const b = top.text; top.text = T; ch("pin pad S42 12 Sep line", b, T); }
  }

  // 4. past tense where it renders
  const padP = pinCard("pad", "pad");
  for (const l of (padP && padP.lines) || []) if (/quick disconnects purging/.test(l.text)) { const b = l.text; l.text = "Pad 2 booster quick disconnects were purged, likely ahead of Booster 22."; ch("pin pad Launch pad 21 Oct", b, l.text); }
  const catchT = cat("pad").history.find((h) => /^SpaceX performing more catch testing/.test(h.text || ""));
  if (catchT && !catchT.card_text) { catchT.card_text = "SpaceX performed more catch testing at the tower top, with launch and landing deluge tests."; ch("pad 20 Oct card_text", catchT.text, catchT.card_text); }
  past(feed("news-mvown148-6ecbdb"), "Booster 22 was moved onto its transporter ahead of returning to Megabay 1");
  past(feed("news-mvntvaz4-93c869"), "Booster 22 propellant loading began for its static fire test");
  past(feed("news-mvmgoq8g-00233b"), "Booster 22 was lifted onto launch Pad 2");
  past(feed("news-mvm4mfz4-21e7ea"), "Booster 22 left Mega Bay 1, preparing to roll out to the launch site for testing");
  past(feed("news-mvozi9xs-e0267f"), "Ship 42 was transported to the Massey's test site, with an engine section in tow");
  past(feed("news-mvortxmw-db27d7"), "Booster 22 was lifted to catch height at the launch site");
  past(feed("news-mvt772o8-49339e"), "Ship 42 and the tiled barrel section arrived back at the production site");

  // 4b. other present-tense rows found by the rendered-output check
  const setCard = (r, t, where) => { if (r && r.card_text !== t) { const b = r.card_text || r.text; r.card_text = t; ch(where, b, t); } };
  const s42mv = st.history.find((h) => h.id === "x-2114568166651428965"); setCard(s42mv, "Ship 42 moved into position at Massey's for static fire testing as Ship 43 departed.", "static S42 26 Oct card_text");
  const b22sf = st.history.find((h) => h.id === "x-2111327584122437857");
  setCard((b22sf && b22sf.updates || []).find((u) => /^Booster 22 waiting to roll out/.test(u.text)), "Booster 22 was waiting to roll out for pre-flight static fire testing.", "static B22 17 Oct row card_text");
  const padH6 = cat("pad").history.find((h) => h.id === "x-2112967167767433728-pad");
  if (padH6) {
    setCard((padH6.updates || []).find((u) => /chopsticks are undergoing maintenance/.test(u.text)), "Pad 2's chopsticks were undergoing maintenance.", "pad 9 Oct row card_text");
    setCard((padH6.updates || []).find((u) => /^Pad 2 clear after Flight 14/.test(u.text)), "Pad 2 was clear after Flight 14; a new servicing structure was going in for hold-down clamp work.", "pad 30 Sep row card_text");
    // a Ship 42 row on the Launch pad card → the Ship 42 pad card (ship and booster/pad rows never cross over)
    const shipRow = (padH6.updates || []).find((u) => /^S42 lifted by Pad 2 chopsticks/.test(u.text)), h7 = cat("pad").history.find((h) => h.id === "s42-pad2-sep");
    if (shipRow && h7) { padH6.updates = padH6.updates.filter((u) => u !== shipRow); shipRow.card_text = "Ship 42 was lifted by the Pad 2 chopsticks in a catch position, with SQD arm connect tests."; h7.updates.push(shipRow); ch("pad 11–12 Sep Ship 42 row moved from the Launch pad card to the Ship 42 pad card", shipRow.text, shipRow.card_text); }
  }

  // 4c. Flight Log Launch date earlier lines: past tense (pinned lines; links kept)
  { const dl = ((road.flightlog_pins || {}).boxes || {}).date; const L = dl && dl.cards && dl.cards[0] && dl.cards[0].lines || [];
    const T = { "Reports say Flight 15 is targeting NET 8 November.": "Reports said Flight 15 was targeting NET 8 November (since moved to NET 12 Nov).", "A slide suggests Ship 42 is ready for flight NET November.": "A slide suggested Ship 42 would be ready for flight NET November." };
    for (const l of L) if (T[l.text]) { const b = l.text; l.text = T[b]; ch(`pin date ${l.day} line (past tense)`, b, l.text); } }
  // 5. S42 Raptor line: one past-tense line (NSF 14 Oct reinstall report + the inferred "all 6 by 26 Oct")
  const rp = cat("raptor"), reinst = rp.history.find((h) => /Raptor engines are reportedly being reinstalled/.test(h.text || ""));
  const R5 = "Ship 42's Raptors were reportedly being reinstalled; all 6 Raptors were installed by 26 Oct."; // one past-tense line; same wording the self-check uses for the superseded 'being reinstalled' post
  if (reinst && reinst.card_text !== R5) { const b = reinst.card_text; reinst.card_text = R5; ch("raptor S42 reinstall card_text", b, R5); }

  // 6. S42 cryo 9 Oct: completion post (LabPadre 15:36 UK) kept; TrackingTheSB 21:30 frost post is a later observation (both tier 2)
  const cr = pinCard("cryo", "S42"), c9 = cr && cr.lines.find((l) => l.day === "9 Oct");
  const h8 = cat("cryo").history.find((h) => h.flight === 15 && /^Ship 42 completed further cryo tests/.test(h.text || ""));
  if (c9 && h8 && c9.at !== h8.at) { const b = `${c9.day} ${c9.time} ${c9.url}`; c9.time = "15:36"; c9.at = h8.at; c9.url = h8.url; ch("pin cryo S42 9 Oct time = card time (completion post)", b, `9 Oct 15:36 ${h8.url}`);
    h8.self_check_flags = [...new Set([...(h8.self_check_flags || []), "after:2026-10-09T20:30:41.000Z"])]; // decided + logged: the daily rule stops re-flagging it
    review.push({ type: "event-time", item: "cryo S42 9 Oct", values: ["2026-10-09T14:36:44.000Z", "2026-10-09T20:30:41.000Z"], sources: [h8.url, "https://x.com/TrackingTheSB/status/2108656416366202950"], kept: "9 Oct 15:36 UK (completion post, LabPadre)", reason: "both tier 2; the 21:30 frost post reads as a later observation. Completion time kept on the Flight Log and Road card; the frost post stays as an Earlier update.", msg: "S42 cryo 9 Oct: completion 15:36 UK kept over the 21:30 frost post (tiers equal, unclear) — Flight Log and Road card now agree" }); }

  // 7. Split the 10 Sep 18:41 Ship/Booster entry: ship part on the S42 card, booster part on the B22 card
  const mix = rp.history.find((h) => /^Ship 42 headed back for its six Raptors; Booster 22/.test(h.text || ""));
  if (mix) {
    const b = mix.text; mix.text = mix.log_text = "Ship 42 headed back for its six Raptors."; mix.hardware = "S42"; if (/[–-]/.test(mix.date)) { mix.date_range = mix.date; mix.date = "10 Sep"; }
    mix.split = { from: b, booster_part: "Booster 22 returned to Megabay 1 for its engines. → Booster 22 Raptor card" };
    ch("raptor 10 Sep entry split (ship part)", b, mix.text);
    const b22 = rp.history.find((h) => h.hardware === "B22" && !(h.flight > road.flight));
    const moving = (mix.updates || []).filter((u) => /^Booster 22\b/.test(u.text));
    mix.updates = (mix.updates || []).filter((u) => !moving.includes(u));
    for (const u of moving) if (!(b22.updates || []).some((x) => x.url === u.url)) { (b22.updates = b22.updates || []).push(u); ch("raptor B22 card: booster row moved from the split entry", undefined, u.text); }
  }

  // 8. Two 30 Sep Raptor-removal rows on the S42 card: keep LabPadre's specific row, the NSF video link moves to also_posts
  const dup = reinst && (reinst.updates || []).find((u) => /Raptor engines have been removed ahead of Flight 15/.test(u.text));
  const rem = rp.history.find((h) => /^Five Raptor 3s were removed from Ship 42/.test(h.text || ""));
  if (dup && rem) { reinst.updates = reinst.updates.filter((u) => u !== dup); rem.also_posts = rem.also_posts || []; if (!rem.also_posts.some((x) => x.url === dup.url)) rem.also_posts.push({ url: dup.url, src: dup.src, at: dup.at, text: dup.text, why: "same 30 Sep removal (deduped row)" }); ch("raptor S42 30 Sep duplicate removal row deduped (link kept in also_posts)", dup.text, null); }

  // 9. generic "three static fires in three days" (B22 ×1, S42 ×2): not a Ship 42 item → un-filed from the static drawer
  const three = feed("news-mvviedow-8ae8e8");
  if (three) { past(three, "SpaceX completed three static fires in three days for Flight 15");
    if (three.box || !three.refiled_pin) { three.refiled_pin = true; if (three.box) three.rerouted = { from: three.box, why: "covers both vehicles (B22 25 Oct, S42 ×2 27 Oct): no single vehicle card; not shown in a Ship 42 drawer" }; delete three.box; ch("feed news-mvviedow-8ae8e8 un-filed (both vehicles; was landing in the Ship 42 drawer)"); } }
  return { changes, review };
}
module.exports = { apply };
if (require.main === module) {
  const dry = process.argv.includes("--dry"), file = path.join(ROOT, "road.json");
  const road = JSON.parse(fs.readFileSync(file, "utf8"));
  const r = apply(road);
  console.log(`\n${r.changes.length} changes, ${r.review.length} logged for review${dry ? " (dry run)" : ""}`);
  if (!dry) { fs.writeFileSync(file, JSON.stringify(road, null, 2) + "\n"); require("./self-check.js").writeReview(r.review, path.join(ROOT, "data", "needs-review.json")); }
}
