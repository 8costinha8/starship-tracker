/* Pipeline fix 1: next-flight picker + precision gate. Replays SAVED Launch Library responses (fixtures/), fake state, fake push.
   node scripts/test-next-flight.js            (offline; nothing fetched, saved, committed or sent)
   env BASELINE=/path/to/original/scripts/check-flights.js  → also replays the ORIGINAL code to show the wrong-flight push it made. */
const fs = require("fs"), path = require("path");
const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", f), "utf8"));
const NF = require("./next-flight.js");
let failed = 0; const check = (ok, m) => { console.log(`${ok ? "✅" : "❌"} ${m}`); if (!ok) failed++; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const NOW = Date.parse("2026-11-21T17:30:00Z");

function harness(mod, state0) {
  let state = clone(state0); const sent = [];
  const mk = (resp) => ({
    fetchJson: async (url) => { const lim = Number((url.match(/limit=(\d+)/) || [])[1]) || 1; return { ...resp, results: resp.results.slice(0, lim) }; }, // honours the endpoint's limit like LL2
    loadState: async () => (state ? clone(state) : null), saveState: async (s) => { state = clone(s); },
    push: async (n) => sent.push(n), readAppJs: () => "", now: () => NOW,
  });
  return { run: async (resp) => { const before = sent.length; const r = await mod.run(mk(resp)); return { r, pushes: sent.slice(before) }; }, get state() { return state; } };
}
const quiet = (fn) => async (...a) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return await fn(...a); } finally { console.log = l; console.warn = w; } };

(async () => {
  const hls = fx("ll2-upcoming-2026-11-21-hls-on-top.json");          // REAL response captured 21 Nov 17:25 UK
  const hlsEdited = clone(hls); hlsEdited.results[0].net = "2027-09-30T00:00:00Z";   // LL2 edits the HLS demo NET (month precision)
  const f16 = fx("ll2-upcoming-fake-flight16-exact.json");              // FAKE: Flight 16 appears Go with an exact time
  const f16q = fx("ll2-upcoming-fake-flight16-q4-placeholder.json");    // FAKE: Flight 16 appears with a Q4 placeholder

  console.log("── unit: picker");
  check(NF.flightNumber("Starship | Flight 16") === 16 && NF.flightNumber("Starship | SpaceX HLS LEO Demo") === null, "flight number parsed from the name; HLS demo has none");
  check(NF.pickNext(hls.results).n === null && /no numbered/.test(NF.pickNext(hls.results).reason), "real response: no numbered flight → unresolved");
  check(NF.pickNext(f16.results).n === 16, "Flight 16 listed first → picked");
  check(NF.pickNext([hls.results[0], { name: "Starship | Flight 17" }, { name: "Starship | Flight 16" }]).n === 17, "an unnumbered mission on top is skipped; first NUMBERED flight wins");
  check(["M", "Y", "Q", "Q4", "H1", "MONTH"].every(NF.isCoarsePrecision) && !["SEC", "MIN", "HR", "DAY", "WK", "", undefined].some(NF.isCoarsePrecision), "month / quarter / half / year are coarse; exact, day, week are not");

  // live state after F15 dropped off LL2 (what check-flights saved when HLS demo was first on top, i.e. before this fix)
  const afterF15 = { n: 15, status: "done", date: "2026-11-13T22:47:36Z", precision: "SEC", outcome: "success", storyWrittenFor: 15, liftoffNotifiedFor: 15 };
  const liveBug = { n: null, status: "tbc", date: "2027-06-30T00:00:00Z", precision: "M", storyWrittenFor: 15, liftoffNotifiedFor: 15 }; // state the ORIGINAL code left behind

  console.log("\n── replay A: today's real LL2 response (HLS LEO Demo on top), then LL2 edits the HLS NET");
  const fixed = require("./check-flights.js");
  const q = quiet((h, resp) => h.run(resp));
  let h = harness(fixed, liveBug);
  let o = await q(h, hls); check(o.pushes.length === 0, "FIXED: real response → no push");
  o = await q(h, hlsEdited);
  check(o.pushes.length === 0 && o.r.unresolved === true, `FIXED: HLS NET edited to Sep 2027 → NO push (unresolved: ${o.r.reason})`);
  check(JSON.stringify(h.state) === JSON.stringify(liveBug), "FIXED: saved state untouched (nothing tracked)");
  h = harness(fixed, afterF15); o = await q(h, hlsEdited);
  check(o.pushes.length === 0 && h.state.n === 15, "FIXED: from the post-Flight-15 state the unnumbered mission is not adopted either (state stays on Flight 15)");

  if (process.env.BASELINE) {
    delete require.cache[require.resolve(process.env.BASELINE)];
    const base = require(process.env.BASELINE); let hb = harness(base, liveBug);
    await q(hb, hls); const ob = await q(hb, hlsEdited);
    check(ob.pushes.length === 1, `BASELINE (original code) pushes: ${ob.pushes.map((n) => `"${n.title} — ${n.body}"`).join("")}`);
    console.log("   ↑ this is the wrong-flight push the fix blocks");
  }

  console.log("\n── replay B: Flight 16 appears (fake LL2 response) — the push must still fire");
  h = harness(fixed, afterF15); o = await q(h, f16);
  check(o.pushes.length === 1 && o.pushes[0].title === "✅ Launch time confirmed" && /Flight 16/.test(o.pushes[0].body), `Flight 16 appears Go + exact time → "${o.pushes[0] && o.pushes[0].title} — ${o.pushes[0] && o.pushes[0].body}"`);
  check(h.state.n === 16, "now tracking Flight 16");
  const slip = clone(f16); slip.results[0].net = "2026-12-15T22:30:00Z";
  o = await q(h, slip); check(o.pushes.length === 1 && o.pushes[0].title === "🚧 Launch delayed", `same flight slips a day (exact times) → "${o.pushes[0] && o.pushes[0].title} — ${o.pushes[0] && o.pushes[0].body}"`);
  const back = clone(f16); back.results[0].net = "2027-01-31T00:00:00Z"; back.results[0].net_precision = { abbrev: "M" }; back.results[0].status = { abbrev: "TBD" };
  o = await q(h, back); check(o.pushes.filter((n) => /delayed|estimated/i.test(n.title)).length === 0, "same flight, date falls back to a month-precision placeholder → no 'Launch delayed' push");

  h = harness(fixed, afterF15); o = await q(h, f16q);
  check(o.pushes.length === 0 && h.state.n === 16, "Flight 16 appears with a Q4 placeholder → tracked silently (unchanged behaviour)");
  console.log(failed ? `\n❌ ${failed} check(s) failed` : "\n✅ next-flight: all checks passed (saved LL2 responses only; fake push; nothing real touched)");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
