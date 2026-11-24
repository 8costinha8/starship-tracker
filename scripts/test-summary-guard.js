/* Offline: summary scope + length guard (scripts/summary-guard.js), fixtures in fixtures/summary-guard/*.json, every flight. */
const fs = require("fs"), path = require("path"), SG = require("./summary-guard.js");
let fails = 0; const ok = (c, m) => { console.log(`${c ? "✅" : "❌"} ${m}`); if (!c) fails++; };
const dir = path.join(__dirname, "..", "fixtures", "summary-guard");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); const g = SG.guardSummary(fx.in, fx.ctx); const w = fx.want;
  ok(g.ok === w.ok && (w.text == null || g.text === w.text) && (w.reason == null || g.reason === w.reason) && (w.changed == null || g.changed === w.changed) && (w.maxLen == null || g.text.length <= w.maxLen) && (w.flag == null || !!g.flag === w.flag), `${f}: "${fx.in}" → ${JSON.stringify({ ok: g.ok, text: g.text, reason: g.reason || null })}`);
}
ok(SG.SUMMARY_MAX === 38 && /38 characters/.test(SG.PROMPT_RULE) && /never another flight number/.test(SG.PROMPT_RULE), "char limit stated (38) and the scope rule is in the prompt rule");
ok(/PROMPT_RULE/.test(fs.readFileSync(path.join(__dirname, "text-split.js"), "utf8")), "the summary writer's prompt carries the rule (text-split.js PROMPT_RULES)");
// guardRoad on a road: category line fixed, card held + needs-review, other flight untouched
const road = { flight: 16, vehicles: ["B23", "S43"], categories: [
  { id: "pad", latest: "Pad 2 work has resumed now that Flight 15 has flown.", history: [{ id: "a", at: "2026-11-19T04:18:00Z", text: "Pad 2 work has resumed now that Flight 15 has flown.", card_text: "Pad 2 work has resumed now that Flight 15 has flown." }, { id: "b", at: "2026-11-10T00:00:00Z", text: "Flight 15 booster caught." }] },
  { id: "cryo", latest: "Both vehicles done.", history: [{ id: "c", flight: 17, at: "2026-11-20T00:00:00Z", text: "Booster 24 began cryo testing at Massey's." }] }] };
const r = SG.guardRoad(road, { now: "2026-11-24T12:00:00Z" });
ok(road.categories[0].latest === "Pad 2 work has resumed." && road.categories[0].history[0].text === "Pad 2 work has resumed.", "guardRoad: the Pad line and card lose the Flight 15 clause");
ok(road.categories[0].history[1].feed_hide && r.review.some((x) => x.type === "summary_offtopic" && x.id === "b"), "guardRoad: an unfixable off-topic card is held (feed_hide) and listed as summary_offtopic");
ok(road.categories[1].history[0].text === "Booster 24 began cryo testing at Massey's." && !road.categories[1].history[0].feed_hide, "guardRoad: another flight's entry is not judged against this flight");
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "road-rules", "road-2026-11-24.json"), "utf8"));
ok(!JSON.stringify(live.categories.map((c) => [c.latest, c.log_latest])).includes("Flight 15 has flown"), "24 Nov road.json (frozen): no 'now that Flight 15 has flown' clause in any category line");
const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
ok(/try \{ \/\/ 24 Nov pre-publish guards[\s\S]*guardRoad[\s\S]*catch \(e\) \{ log\(`pre-publish guards skipped/.test(cr), "checker integration is wrapped in try/catch (a guard error never breaks a run)");
console.log(fails ? `\n❌ ${fails} failed` : "\nAll summary-guard checks passed."); process.exit(fails ? 1 : 0);
