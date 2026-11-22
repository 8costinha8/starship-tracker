// P2: stale-data self-alarm + dead-man's switch pieces. Offline; nothing is sent.
const fs = require("fs"), path = require("path"), os = require("os");
const F = require("./freshness.js"), D = require("./deadman.js"), health = require("./health.js");
let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log("  ✅ " + m); } else { fail++; console.log("  ❌ " + m); } };
const MIN = 60000, NOW = Date.parse("2026-11-22T12:00:00Z"), ago = (m) => new Date(NOW - m * MIN).toISOString();
const app = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const appFn = new Function(app.slice(app.indexOf("// <stale-fn>"), app.indexOf("// </stale-fn>")) + "; return dataStaleness;")();

console.log("staleness rules (checker copy = app copy):");
const cases = [
  ["fresh (12 min)", { updated: ago(12) }, "ok", false],
  ["normal hourly commit lag (65 min)", { updated: ago(65) }, "ok", false],
  ["late (2 h)", { updated: ago(120) }, "late", false],
  ["stale (3 h 10 min)", { updated: ago(190) }, "stale", true],
  ["dead (2 days)", { updated: ago(2880) }, "stale", true],
  ["LL2 down 4 h while the checker itself runs", { updated: ago(10), sources: { ll2: { status: "failed", last_ok: ago(240), consecutive_failures: 16 } } }, "stale", true],
  ["LL2 failed 20 min ago only", { updated: ago(10), sources: { ll2: { status: "failed", last_ok: ago(35), consecutive_failures: 1 } } }, "ok", false],
  ["no health file / unreadable", null, "unknown", false],
  ["garbage timestamp", { updated: "nope" }, "unknown", false],
  ["clock in the future", { updated: new Date(NOW + 9 * MIN).toISOString() }, "ok", false],
];
for (const [name, h, level, stale] of cases) {
  const a = F.dataStaleness(h, NOW), b = appFn(h, NOW);
  ok(a.level === level && a.stale === stale && JSON.stringify(a) === JSON.stringify(b), `${name} → ${a.level}${a.stale ? " (banner)" : ""}; app copy identical`);
}
ok(/\{stale\.stale && <span className="road-xoff road-stale"/.test(app) && /const stale = dataStaleness\(useHealthJson\(\), Date\.now\(\)\)/.test(app), "app: the chip renders only when stale.stale");
ok(/Last checked \{lastCheckedLabel\(useHealthJson\(\)\)\}/.test(app) && !/Last checked \{fmtDay\(String\(DATA_CHECKED\)/.test(app), "app: About 'Last checked' reads the checker's timestamp (DATA_CHECKED is only the offline fallback)");
const lc = new Function("ukStamp", "feedTime", "fmtDay", "DATA_CHECKED", app.slice(app.indexOf("function lastCheckedLabel"), app.indexOf("function AboutPanel")) + "; return lastCheckedLabel;")(
  (iso) => "22 Nov", (iso) => "09:45", (s) => s, "14 Nov 2026");
ok(lc({ updated: "2026-11-22T09:45:28Z" }) === "22 Nov · 09:45 UK" && lc(null) === "14 Nov", "label: '22 Nov · 09:45 UK' from health.updated; falls back to the old constant only when the file is unreadable");

console.log("\ndead-man's switch (retrospective):");
ok(D.gapInfo(ago(15), NOW).missed === 0 && D.gapInfo(ago(40), NOW).level === "ok", "15 / 40 min since the last run → fine");
const g = D.gapInfo(ago(75), NOW); ok(g.missed === 4 && g.level === "late", `75 min gap → ${g.missed} runs missed`);
ok(D.gapInfo(ago(600), NOW).level === "dead" && D.gapInfo(ago(600), NOW).missed === 39, "10 h gap → dead, 39 runs missed");
ok(D.gapInfo(undefined, NOW).level === "unknown" && D.gapInfo(ago(-5), NOW).level === "unknown", "first run / clock skew → unknown, never an alarm");
let pinged = []; const fakeFetch = async (u, o) => { pinged.push({ u, o }); return { ok: true }; };
(async () => {
  ok((await D.ping("", { fetchFn: fakeFetch })).sent === false && pinged.length === 0, "no HEALTHCHECK_URL → inert, nothing fetched");
  ok((await D.ping("http://insecure.example/x", { fetchFn: fakeFetch })).sent === false && pinged.length === 0, "non-https URL refused");
  const r = await D.ping("https://hc-ping.example/abc", { fetchFn: fakeFetch, kind: "" }); ok(r.sent && pinged.length === 1 && pinged[0].o.method === "GET", "https URL → one GET");
  ok((await D.ping("https://hc-ping.example/abc", { fetchFn: async () => { throw new Error("down"); }, log: () => {} })).sent === false, "a failing ping never throws into the checker");

  console.log("\nhealth.json: missed runs, source freshness, alert:");
  const t = fs.mkdtempSync(path.join(os.tmpdir(), "hl-")); fs.mkdirSync(path.join(t, "data"));
  const rec = (name, res, now) => health.record(name, res, { root: t, now, log: () => {} });
  rec("check-flights", { ok: true }, NOW - 300 * MIN);
  health.noteSource("ll2", true); let h = rec("check-flights", { ok: true }, NOW - 285 * MIN);
  ok(h.sources.ll2.status === "ok" && h.alert === false, "LL2 ok → recorded, no alert");
  for (let i = 0; i < 7; i++) { health.noteSource("ll2", false, new Error("HTTP 429")); h = rec("check-flights", { ok: true }, NOW - (270 - i * 15) * MIN); }
  ok(h.sources.ll2.consecutive_failures === 7 && h.alert === false && h.status === "ok", "LL2 down for 7 runs: counted even though the run 'succeeds' (it used to show ok)");
  health.noteSource("ll2", false, new Error("HTTP 429")); h = rec("check-flights", { ok: true }, NOW - 165 * MIN);
  ok(h.alert === true && /ll2 unreachable for 8 runs/.test(h.alert_reasons.join()), `8th failed poll → alert: ${h.alert_reasons.join("; ")}`);
  ok(health.shouldCommit({ ...h, status: "ok", sources: { ll2: { status: "ok" } }, committed_at: ago(5) }, h, NOW), "a source going down is committed at once (not after the hourly wait)");
  health.noteSource("ll2", true); health.noteGap(g); h = rec("check-flights", { ok: true }, NOW - 150 * MIN);
  ok(h.sources.ll2.consecutive_failures === 0 && h.missed_runs_24h === 4 && h.alert === true && /missed in 24 h/.test(h.alert_reasons.join()), "recovery clears the LL2 counter; 4 missed runs in 24 h raise the alert");
  ok(h.gaps.length === 1 && h.gaps[0].missed === 4, "the gap is recorded with its size");
  console.log(`\n${fail ? "❌" : "✅"} ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
