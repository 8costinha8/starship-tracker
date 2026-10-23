// Lifecycle + source tiers + images: one entry per (milestone + flight + vehicle), Expected → In progress → Completed
const xf = require("./x-first.js");
let fails = 0; const check = (ok, name) => { console.log((ok ? "✅ " : "❌ ") + name); if (!ok) fails++; };
const road = { flight: 15, categories: [{ id: "pad", name: "Pad activity", status: "pending", history: [] }, { id: "cryo", name: "Cryo tests", status: "pending", history: [] }, { id: "date", name: "Launch date", status: "pending", history: [] }] };
const post = (id, user, iso, text, img) => ({ post_id: id, url: `https://x.com/${user}/status/${id}`, created_at: iso, text, author: { username: user, name: user }, media: img ? [{ type: "photo", url: `https://pbs.twimg.com/${img}.jpg` }] : [] });
const c = (phase, text, extra = {}) => ({ kind: "road", stage: "pad", hardware: "S42", event: "pad_work", phase, flight: 15, text, media_fit: "shows-event", speculative: false, ...extra });
// 1. Tier 1 expected (no media) → context image from an earlier trusted photo of the same thing
road.categories[0].history.push({ id: "x-old", x_first: true, stage: "pad", hardware: "S42", at: "2026-09-01T10:00:00Z", trust: "trusted", text: "Ship 42 at Pad 2.", media_override: { type: "photo", image: "https://pbs.twimg.com/old.jpg", author: "efraser77", post_url: "https://x.com/efraser77/status/1" } });
let r = xf.placePost(road, post("11", "NASASpaceflight", "2026-09-11T00:41:01Z", "Ship 42 heading to the launch site for catch testing."), c("expected", "Ship 42 is heading to Pad 2 for catch tests.", { media_fit: "none" }));
const e = r.entry;
check(e.milestone && e.milestone.phase === "expected" && e.tier === 1 && e.media_context && /old\.jpg/.test(e.media_context.image) && !e.media_override, "upcoming: Expected entry uses a context image of the same ship from an earlier trusted post");
// 2. Tier 2 says it's done → reported line under it, phase not moved
r = xf.placePost(road, post("12", "LabPadre", "2026-09-11T10:00:00Z", "Ship 42 lifted by chopsticks", "lab"), c("completed", "Ship 42 is in the chopsticks."));
check(r.entry === e && e.milestone.phase === "completed" && e.tier === 2 && r.phase && r.phase.to === "completed", "Tier 2 (LabPadre) can mark Completed, labelled Reported");
e.milestone.phase = "expected"; delete e.complete; // reset for the Tier 1 path below
r = xf.placePost(road, post("19", "TrackingTheSB", "2026-09-11T11:00:00Z", "Ship 42 heading back", "t19"), { ...c("completed", "Ship 42 is heading back, catch tests done."), inferred: true });
check(r.entry === e && e.milestone.phase === "expected" && e.trust === "unconfirmed", "an inferred completion is marked Unconfirmed and moves nothing");
delete e.trust;
// 3. Tier 1 progress then completed → same entry, collapsed history, real media
r = xf.placePost(road, post("13", "NASASpaceflight", "2026-09-11T15:08:20Z", "Ship 42 is hanging out with Pad 2's chopsticks.", "p13"), c("progress", "Ship 42 is in Pad 2's chopsticks for catch tests."));
check(r.entry === e && e.milestone.phase === "progress" && r.phase && r.phase.to === "progress", "Tier 1 moves Expected → In progress in place");
r = xf.placePost(road, post("14", "NASASpaceflight", "2026-09-13T03:02:31Z", "Ship 42 has finally escaped the grip of Pad 2's chopsticks.", "p14"), c("completed", "Ship 42 finished catch tests at Pad 2."));
check(r.entry === e && e.milestone.phase === "completed" && e.complete && /p14\.jpg/.test(e.media_override.image) && e.updates.length >= 2 && road.categories[0].history.filter((h) => h.milestone).length === 1, "Tier 1 Completed: one entry, real post media, build-up history kept underneath");
// 4. Tier 3 rumour from a Tier 1 account stays Expected
r = xf.placePost(road, post("15", "SpaceX", "2026-10-20T10:00:00Z", "Booster 22 could roll out next week"), { ...c("completed", "Booster 22 could roll out next week."), hardware: "B22", event: "rollout", media_fit: "none" });
check(r.tier === 1 && r.entry.hedged && r.entry.milestone.phase === "expected" && !r.entry.complete, "Tier 1 hedged wording (\"could\") stays Tier 1, labelled Expected, never Completed");
  r = xf.placePost(road, post("18", "LabPadre", "2026-10-20T12:00:00Z", "Hearing B22 might roll soon"), { ...c("progress", "Booster 22 might roll out soon."), hardware: "B22", event: "rollout", media_fit: "none" });
  check(r.tier === 3 && r.entry.milestone.phase === "expected", "rumour wording from a non-Tier-1 account is Tier 3 (Rumour), Expected only");
// 5. wrong vehicle number → unconfirmed
r = xf.placePost(road, post("16", "NASASpaceflight", "2026-10-20T11:00:00Z", "Booster 23 cryo test complete", "p16"), { ...c("completed", "Booster 24 finished cryo testing."), stage: "cryo", hardware: "B24", event: "cryo_test", flight: 16 });
check(r.accurate === false && r.entry.trust === "unconfirmed", "vehicle number not in the post → marked unconfirmed");
// 6. unrelated media → no picture
r = xf.placePost(road, post("17", "NASASpaceflight", "2026-10-21T11:00:00Z", "Pad 2 BQD purge", "launch"), { ...c("progress", "Pad 2 BQDs are purging."), hardware: "Pad 2", event: "pad_work", media_fit: "unrelated" });
check(!r.entry.media_override, "media that doesn't match the text is dropped");
console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
