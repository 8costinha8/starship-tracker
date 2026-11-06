/* 6 Nov handover: news feed lines are full past-tense sentences with a full stop;
   Flight Log and Road card share one wording for the same post; summary merges
   active+passive lift lines. Offline. */
const fs = require("fs"), path = require("path");
const N = require("./news.js"), H = require("./handover.js"), FL = require("./flightlog.js"), RC = require("./render-check.js");
const ROOT = path.join(__dirname, "..");
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) failed++; };

// 1. live data: the five news items + Launch pad 6 Nov wording
const want = {
  "news-mw1caeo0-1457b7": /has boom removed\.$/,
  "news-mw2npcig-f44b5b": /caught at base\.$/,
  "news-mw2xdk08-ec25f3": /Starbase today\.$/,
  "news-mw43922g-ea7dc1": /^Starship Flight 15 has a tentative target date of Friday 13 November\.$/,
  "news-mw44pp4o-5bca28": /^Pad 39A completed a full water deluge test\.$/,
};
for (const [id, re] of Object.entries(want)) {
  const f = (live.feed_items || []).find((x) => x.id === id);
  check(!!f && re.test(f.body) && /[.!?]/.test(f.body.slice(-1)), `feed ${id}: "${f && f.body}"`);
}
check(!/undergoes/i.test((live.feed_items || []).find((x) => x.id === "news-mw44pp4o-5bca28").body) && /Pad 39A/.test((live.feed_items || []).find((x) => x.id === "news-mw44pp4o-5bca28").body), "Pad 39A news is past tense with proper caps");

const padH = live.categories.find((c) => c.id === "pad").history.find((h) => h.id === "x-2118553539345883303");
const one = "Starbase tower completed a deluge system test.";
check(padH && padH.text === one && padH.card_text === one && padH.log_text === one && padH.x_text === one, `Launch pad 6 Nov one wording on every field: "${padH && padH.log_text}"`);
const fl = FL.boxes(live).pad.cards.find((c) => c.name === "Launch pad").lines.find((l) => l.url === padH.url);
check(fl && fl.text === one, `Flight Log Launch pad 6 Nov shows the same line: "${fl && fl.text}"`);

// 2. news finishHeadline: full stop, caps, past-tense nudge, flag fragments
check(N.finishHeadline("Starship pad 39a undergoes full water deluge test").text === "Starship Pad 39A completed a full water deluge test.", "finishHeadline: undergoes → completed a, Pad 39A, full stop");
check(N.finishHeadline("Starship flight 15 has a tentative target date of Friday 13 November").text === "Starship Flight 15 has a tentative target date of Friday 13 November.", "finishHeadline: Flight 15 + full stop");
check(N.finishHeadline("Booster 22 completed a static fire at Massey's").ok === true && N.finishHeadline("Booster 22 completed a static fire at Massey's").text.endsWith("."), "finishHeadline: already-good line keeps a full stop");
check(N.finishHeadline("Pad deluge test").ok === false && N.finishHeadline("Pad deluge test").reason === "no verb (fragment)", "finishHeadline: verbless fragment flagged");
check(/full past-tense sentence|END with a full stop|Pad 39A/.test(N.buildNewsPrompt([{ src: "NSF", title: "t", text: "x" }], [])), "Grok news prompt requires past-tense full sentences with a full stop");

// decideNews keeps the finished sentence (does not strip the full stop) and skips fragments
{
  const news = N.freshNewsState(Date.now()); news.seen = ["seed"]; // not first run
  const items = [
    { key: "k1", title: "NSF", text: "Pad 39A ran a full water deluge test this morning", url: "u1", publishedAt: new Date().toISOString(), src: "NSF", tier: "trusted" },
    { key: "k2", title: "NSF", text: "something about a deluge", url: "u2", publishedAt: new Date().toISOString(), src: "NSF", tier: "trusted" },
  ];
  const logs = [];
  const pushes = N.decideNews(items, [
    { item: 1, push: true, dup: null, story: "deluge", headline: "Pad 39A completed a full water deluge test" },
    { item: 2, push: true, dup: null, story: "frag", headline: "Pad deluge test" },
  ], news, Date.now(), (m) => logs.push(m));
  check(pushes.length === 1 && pushes[0].body === "Pad 39A completed a full water deluge test.", `decideNews body keeps full stop: "${pushes[0] && pushes[0].body}"`);
  check(logs.some((m) => /no verb \(fragment\)/.test(m)), "decideNews skips a verbless headline");
}

// 3. Flight Log / Road share one wording (render-check mismatch rule) + chopsticks merge
const rc = RC.check(live);
check(!rc.some((f) => f.type === "render-mismatch" && /2118553539345883303/.test(f.msg || "")), "render-check: no Flight Log ↔ Road mismatch on the 6 Nov deluge post");
check(!rc.some((f) => /news-mw44pp4o|news-mw43922g/.test(JSON.stringify(f))), "render-check: Pad 39A / Flight 15 news lines clean");
check(H.mergeVoice("Pad 2 chopsticks lifted Ship 42 without the stabiliser arms.", "Ship 42 was lifted to catch height by the Pad 2 chopsticks.") === "Pad 2 chopsticks lifted Ship 42 to catch height without the stabiliser arms.", "mergeVoice: active + passive chopsticks lift → one sentence");
const sum = H.summarize(live);
const s42pad = sum && sum.items.find((e) => e.box === "pad" && /Ship 42/.test(e.vehicle));
check(s42pad && s42pad.text === "Pad 2 chopsticks lifted Ship 42 to catch height without the stabiliser arms.", `F15 Ship 42 pad summary is one sentence: "${s42pad && s42pad.text}"`);

// 4. source: x-first / check-road write log_text and card_text together
const xf = fs.readFileSync(path.join(__dirname, "x-first.js"), "utf8");
const cr = fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8");
check(/if \(logText\) h\.card_text = logText/.test(xf) && /log_text: logText, card_text: logText/.test(xf), "x-first sets card_text = log_text for the same post");
check(/h\.card_text = line; \/\* Flight Log \+ Road: one wording \*\//.test(cr), "check-road edit path sets card_text = log line");

console.log(failed ? `\n❌ ${failed} check(s) failed.` : "\n✅ All nov06 checks passed.");
process.exit(failed ? 1 : 0);
