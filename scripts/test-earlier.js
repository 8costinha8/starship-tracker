// Road page "Earlier updates": repeat completion lines folded, newest first, same-day lines show their post time
// ("25 Oct · 11:27", 24h Europe/London, no "UK"), every line boxed.  node scripts/test-earlier.js
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const grab = (re) => (app.match(re) || [""])[0];
const src = [grab(/const MON3 = [^\n]+/), grab(/function ukParts[^\n]+/), app.slice(app.indexOf("function ukStamp("), app.indexOf("\n}\n", app.indexOf("function ukStamp(")) + 2),
  grab(/const sfIso = [^\n]+/), app.slice(app.indexOf("function feedTime("), app.indexOf("\n}\n", app.indexOf("function feedTime(")) + 2),
  grab(/const upIso = [^\n]+/), app.slice(app.indexOf("function roadUpdates("), app.indexOf("\n}\n", app.indexOf("function roadUpdates(")) + 2)].join("\n");
const fmtDay = (d) => String(d || "");
const roadUpdates = eval(`(() => { ${src}\n return roadUpdates; })()`);
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const sec = live.categories.find((c) => c.id === "static"), card = sec.history.find((h) => h.id === "x-2111327584122437857");
const rows = roadUpdates(card);
const shown = rows.map((r) => `${r.when || r.u.date} | ${r.u.text}`);
console.log(shown.join("\n"));
check(rows.length === 5 && !rows.some((r) => /conducts a static fire|conducted a static fire|completed a static fire/i.test(r.u.text)), "B22 card: the 3 repeat static-fire completion lines are folded");
check(rows[0].when === "25 Oct · 12:37" && /Transport ring/.test(rows[0].u.text) && rows[1].when === "25 Oct · 11:27" && /Road closed/.test(rows[1].u.text), "25 Oct steps newest first with their post times (no 'UK')");
check(rows[2].u.date === "17 Oct" && !rows[2].when && rows[3].u.date === "9 Oct" && rows[4].u.date === "30 Sep" && rows[4].u.text === "Booster 22 could be ready for a static fire within two weeks.", "older items date-only, oldest at the bottom, 30 Sep reworded");
check(shown.every((t) => !/\bUK\b/.test(t)), "no 'UK' label");
// general rules
const g = roadUpdates({ complete: true, at: "2026-10-25T14:00:00Z", updates: [{ date: "25 Oct", text: "A done", phase: "completed", url: "https://x.com/a/status/1" }, { date: "25 Oct", text: "B", url: "https://x.com/a/status/2114317866409595106" }, { date: "25 Oct", text: "C", at: "2026-10-25T09:05:00Z" }, { date: "2 Oct", text: "E", at: "2026-10-02T09:05:00Z" }, { date: "2 Oct", text: "F", at: "2026-10-02T08:00:00Z" }, { date: "1 Oct", text: "D" }] });
check(g.map((r) => r.u.text).join() === "B,C,E,F,D", "general: completed repeats folded on a completed card, newest first");
check(g[0].when === "25 Oct · 11:27" && g[1].when === "25 Oct · 09:05", "2+ same-day lines get times: from the tweet id (snowflake) or the stored time, GMT");
check(g[2].when === "2 Oct · 10:05" && g[3].when === "2 Oct · 09:00" && !g[4].when, "BST handled; a lone day stays date-only");
const open = roadUpdates({ updates: [{ date: "1 Oct", text: "X", phase: "completed" }] });
check(open.length === 1, "a card that isn't completed keeps its completion-phase lines");
check(/className="bu-pill bu-nolink"/.test(app) && /bu-nolink \{ cursor: default; \}/.test(app), "a line without a link is still boxed (bu-pill), just not tappable");
// feed itself untouched: the ring and road-closure posts stay their own Road cards
check(sec.history.some((h) => h.id === "x-2114335419785679308" && !h.feed_hide) && sec.history.some((h) => h.id === "x-2114317866409595106" && !h.feed_hide), "the folded/merged steps still show as their own Road page cards");
console.log(fails ? `\n❌ ${fails} failed` : "\n✅ all passed"); process.exit(fails ? 1 : 0);
