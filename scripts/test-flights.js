/* ─────────────────────────────────────────────────────────────
   Offline test of check-flights.js: fake LL2, fake Firebase state,
   fake story writer and git. Nothing is fetched, saved or sent.
     node scripts/test-flights.js
   ───────────────────────────────────────────────────────────── */
const flights = require("./check-flights.js");

let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };

const T0 = "2026-10-13T22:00:00Z"; // 23:00 UK
let ll2 = null;
let state = null;
const sent = [];
const commits = [];
let appJs = 'const FLIGHTS = [\n  { n: 14, date: "2026-09-28T12:15:00Z", outcome: "success",\n    story: "Example story." },\n];\nconst DATA_CHECKED = "1 Oct 2026";\n';
const deps = {
  fetchJson: async (url) => (url.includes("/upcoming/") ? { results: [ll2] } : { ...ll2, pad: { name: "Orbital Launch Pad 2" }, rocket: { configuration: { variant: "V3" } } }),
  loadState: async () => (state ? JSON.parse(JSON.stringify(state)) : null),
  saveState: async (s) => { state = JSON.parse(JSON.stringify(s)); },
  push: async (n) => { sent.push(n); console.log(`  (fake push) ${n.title} — ${n.body}`); },
  readAppJs: () => appJs,
  writeAppJs: (t) => { appJs = t; },
  commitAndPush: (n, label) => commits.push(`log Flight ${n} (${label})`),
  writeStory: async () => ({ headline: "Test headline", story: "Test story." }),
  now: () => Date.parse("2026-10-12T12:00:00Z"),
};
const launch = (n, abbrev, net = T0, precision = "SEC") => ({ name: `Starship | Flight ${n}`, url: `https://ll2.test/${n}`, net, net_precision: { abbrev: precision }, status: { abbrev } });
const step = async (label, l, nowIso) => {
  ll2 = l; if (nowIso) deps.now = () => Date.parse(nowIso);
  const before = sent.length;
  console.log(`\n── ${label}`);
  await flights.run(deps);
  return sent.slice(before);
};

(async () => {
  let got = await step("first run: baseline, no push", launch(15, "TBC", "2026-10-31T00:00:00Z", "M"));
  check(got.length === 0 && state.n === 15, "baseline saved, no push");

  got = await step("Go with an exact time", launch(15, "Go"));
  check(got.length === 1 && got[0].title === "✅ Launch time confirmed", `date + time confirmed → "${got[0] && got[0].title}" / "${got[0] && got[0].body}"`);

  got = await step("T-55 min", launch(15, "Go"), "2026-10-13T21:05:00Z");
  check(got.length === 1 && got[0].title === "📡 Livestream ready", "livestream reminder inside the last hour");

  got = await step("liftoff: LL2 In Flight, net moved to the real liftoff time", launch(15, "In Flight", "2026-10-13T22:03:00Z"), "2026-10-13T22:10:00Z");
  check(got.length === 1 && got[0].title === "🚀 Liftoff!" && got[0].body === "Flight 15 is in the air · Watch now", `one liftoff push: "${got[0] && got[0].title}" / "${got[0] && got[0].body}"`);
  check(!got.some((n) => /tbc|Status changed/i.test(`${n.title} ${n.body}`) || /delayed/i.test(n.title)), "no 'Status changed to tbc', no 'Launch delayed' for the net moving at liftoff");

  got = await step("still in flight (then Deployed)", launch(15, "Deployed", "2026-10-13T22:03:00Z"), "2026-10-13T22:25:00Z");
  check(got.length === 0, "next runs in flight: no second liftoff push, no status push");

  got = await step("result: Success", launch(15, "Success", "2026-10-13T22:03:00Z"), "2026-10-13T23:30:00Z");
  check(got.length === 1 && got[0].title === "🏁 Flight 15 — Success" && commits.length === 1 && /n: 15/.test(appJs), "result → story logged in app.js, committed, one '🏁 Flight 15 — Success' push (unchanged)");

  got = await step("next run, still Success", launch(15, "Success", "2026-10-13T22:03:00Z"), "2026-10-13T23:45:00Z");
  check(got.length === 0 && commits.length === 1, "no repeat of the result push or the story");

  got = await step("LL2's first result is now Flight 16 (later placeholder date)", launch(16, "TBD", "2026-12-31T00:00:00Z", "Q4"), "2026-10-14T03:00:00Z");
  check(got.length === 0 && state.n === 16, "flight switch → tracked silently, no 'Launch delayed' / 'Flight update' push");

  got = await step("Flight 16 really slips (same flight)", launch(16, "TBC", "2027-01-20T00:00:00Z", "DAY"), "2026-10-20T03:00:00Z");
  check(got.length === 1 && got[0].title === "🚧 Launch delayed", `a delay of the SAME flight still pushes '🚧 Launch delayed' ("${got[0] && got[0].body}")`);

  got = await step("Flight 16 goes TBC → TBD", launch(16, "TBD", "2027-01-20T00:00:00Z", "DAY"), "2026-10-21T03:00:00Z");
  check(got.length === 1 && got[0].body === "Now: Date to be confirmed", `generic status push uses words, not codes ("${got[0] && got[0].title} / ${got[0] && got[0].body}")`);

  check(flights.mapLL2Status("In Flight") === "inflight" && flights.mapLL2Status("Deployed") === "inflight" && flights.mapLL2Status("Success") === "done" && flights.mapLL2Status("Hold") === "confirmed", "status mapping: In Flight/Deployed → inflight, results → done, Hold → confirmed");

  console.log(failed ? `\n❌ ${failed} check(s) failed` : "\n✅ All checks passed. (Offline — nothing real was fetched, saved, committed or sent.)");
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
