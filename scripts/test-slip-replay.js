// P3: newest-date-wins proven on a REALISTIC slip: Flight 15's real date history (fixtures/f15-date-slips.json, rebuilt from the push log).
// A: the flight checker (debounce, one push per real slip, none for a wiggle, immediate on launch day, final state = newest date).
// B: the Road "Launch date" box (x-first placePost) with the same posts, locked after the confirmation, plus an older post arriving late.
// C: both agree on the final date. Offline: fake LL2, fake state, fake send.
process.env.PUSH_SHADOW = "0";
const fs = require("fs"), path = require("path");
const flights = require("./check-flights.js"), xf = require("./x-first.js");
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "f15-date-slips.json"), "utf8"));
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
(async () => {
  console.log("A. flight checker replay:");
  let state = null, ll2 = null, clock = 0; const sent = [];
  const deps = { fetchJson: async () => ({ results: [ll2] }), loadState: async () => (state ? JSON.parse(JSON.stringify(state)) : null), saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); }, push: async (n) => { sent.push(n); }, readAppJs: () => "", writeAppJs() {}, commitAndPush() {}, writeStory: async () => ({}), readRoad: () => ({ flight: 15 }), flagReview() {}, now: () => clock };
  const all = [];
  for (const p of fx.polls) {
    clock = Date.parse(p.at); ll2 = { name: "Starship | Flight 15", url: "https://ll2.test/15", net: p.net, net_precision: { abbrev: p.prec }, status: { abbrev: p.status } };
    const b = sent.length; const log = console.log; console.log = () => {}; try { await flights.run(deps); } finally { console.log = log; }
    const got = sent.slice(b).map((n) => n.title); all.push(...sent.slice(b));
    ok(JSON.stringify(got) === JSON.stringify(p.expect), `${p.at.slice(5, 16)} ${p.status} ${p.net.slice(5, 16)} ${p.prec}${p.note ? " (" + p.note + ")" : ""} → ${got.length ? got.join(" + ") : "no push"}`);
  }
  const datePushes = all.filter((n) => /delayed|estimated|confirmed/i.test(n.title));
  ok(datePushes.length === 5, `5 date pushes: 3 slips + the exact time + the confirmation... and none for the wiggle (got ${datePushes.length}); the live log also holds "Flight 15 now NET …" pushes from the Road path`);
  ok(state.date === "2026-11-13T22:47:00Z" && !state.pendingDate, `final checker state = newest date (${state.date}), no pending leftovers`);
  ok(/22:47/.test(datePushes[datePushes.length - 1].body), `last push says the newest time: "${datePushes[datePushes.length - 1].body}"`);
  ok(new Set(datePushes.map((n) => n.title + n.body)).size === datePushes.length, "no two date pushes are identical (no duplicate alert for the same date)");

  console.log("\nB. Launch date box:");
  const road = { flight: 15, categories: [{ id: "date", name: "Launch date", status: "pending", history: [] }] };
  const post = (p) => ({ post_id: p.id, url: `https://x.com/${p.user}/status/${p.id}`, created_at: p.at, text: p.text, author: { username: p.user, name: p.user }, media: [] });
  const cls = (p) => ({ kind: "road", stage: "date", hardware: null, event: "launch_date", phase: p.phase, flight: 15, text: p.line, log_text: p.line, media_fit: "none", speculative: false });
  let entry = null;
  for (const p of fx.posts) {
    const r = xf.placePost(road, post(p), cls(p)); entry = entry || r.entry;
    if (p.lock) { entry.text_locked = true; entry.media_locked = true; }
    ok(r.entry.id === entry.id && entry.text === p.line, `${p.at.slice(5, 16)} post → box says "${entry.text}"${r.merged ? " (merged)" : " (new)"}`);
  }
  ok(road.categories[0].history.length === 1, "one Launch date entry the whole time (no duplicate cards)");
  ok((entry.updates || []).length >= 3 && /12 November/.test(JSON.stringify(entry.updates)), `older dates kept underneath as history (${(entry.updates || []).length} lines)`);
  const late = fx.late_older_post; xf.placePost(road, post(late), cls(late));
  ok(entry.text === fx.posts[fx.posts.length - 1].line, "an older post arriving late does not roll the box back");

  console.log("\nC. consistency:");
  ok(/22:47/.test(entry.text) && /22:47/.test(datePushes[datePushes.length - 1].body), "Launch date box and the last push agree: 22:47");
  console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
