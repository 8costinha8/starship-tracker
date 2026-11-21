// F5: the Launch date box must follow the NEWEST date even after the card was locked (media-cascade text_locked).
// Replays the F16-rehearsal case: 13 Dec confirmed + locked, then a scrub to 14 Dec. BASELINE=<x-first.js of the old code> replays the old code.
const xf = require(process.env.BASELINE || "./x-first.js");
let fails = 0; const check = (ok, name) => { console.log((ok ? "✅ " : "❌ ") + name); if (!ok) fails++; };
const mkRoad = () => ({ flight: 16, categories: [{ id: "date", name: "Launch date", status: "pending", history: [] }, { id: "pad", name: "Pad", status: "pending", history: [] }] });
const post = (id, user, iso, text) => ({ post_id: id, url: `https://x.com/${user}/status/${id}`, created_at: iso, text, author: { username: user, name: user }, media: [] });
const cls = (text, extra = {}) => ({ kind: "road", stage: "date", hardware: null, event: "launch_date", phase: "completed", flight: 16, text, log_text: text, media_fit: "none", speculative: false, ...extra });
const road = mkRoad();
let r = xf.placePost(road, post("1", "SpaceX", "2026-12-12T10:00:00Z", "Starship Flight 16 targeting 13 December"), cls("SpaceX now targets 13 December."));
const h = r.entry; check(!r.merged && h.milestone && h.milestone.type === "launch_date", "13 Dec date card created");
h.text_locked = true; h.media_locked = true; // what media-cascade does when SpaceX's own post confirms (media-cascade.js:127)
r = xf.placePost(road, post("2", "SpaceX", "2026-12-13T18:00:00Z", "Flight 16 now targeting 14 December"), cls("SpaceX now targets 14 December."));
check(r.merged && r.entry.id === h.id, "scrub post merges into the same date entry (expected: one date card)");
check(h.text === "SpaceX now targets 14 December.", `box text follows the newest date: "${h.text}"`);
check(h.updates && h.updates.some((u) => /13 December/.test(u.text)), "the 13 Dec line is kept underneath as history");
// an OLDER post arriving late must not roll the date back
r = xf.placePost(road, post("0", "NASASpaceflight", "2026-12-12T09:00:00Z", "NET 12 December?"), cls("Flight 16 may fly 12 December.", { phase: "expected" }));
check(h.text === "SpaceX now targets 14 December.", `a late, older post does not roll the box back ("${h.text}")`);
// other boxes keep their lock
const road2 = mkRoad(); const pc = (text, at) => ({ kind: "road", stage: "pad", hardware: "Pad 2", event: "pad_work", phase: "completed", flight: 16, text, log_text: text, media_fit: "none", speculative: false, at });
r = xf.placePost(road2, post("5", "SpaceX", "2026-12-01T10:00:00Z", "Pad 2 deluge test done"), pc("Pad 2 completed its deluge test."));
const p = r.entry; p.text_locked = true;
r = xf.placePost(road2, post("6", "SpaceX", "2026-12-01T12:00:00Z", "Pad 2 deluge test again"), pc("Pad 2 finished another deluge test."));
check(p.text === "Pad 2 completed its deluge test.", `locked wording of other boxes unchanged ("${p.text}")`);
// same scrub when the classifier gives NO event for a date post (the F16-rehearsal harness does exactly this): the non-milestone merge path
const road3 = mkRoad(); const nc = (text) => ({ kind: "road", stage: "date", hardware: "Flight 16", event: null, status: "confirmed", flight: 16, text, log_text: text, media_fit: "none", speculative: false });
r = xf.placePost(road3, post("11", "SpaceX", "2026-12-12T19:50:00Z", "now targeting 13 December"), nc("SpaceX now targets 13 December for Flight 16."));
const h3 = r.entry;
r = xf.placePost(road3, post("12", "SpaceX", "2026-12-13T22:50:00Z", "scrubbed, tomorrow 14 December"), nc("SpaceX scrubbed the 13 December attempt and now targets 14 December for Flight 16."));
check(r.merged && r.entry.id === h3.id && /14 December/.test(h3.text), `[no-event path] box follows the newest date ("${h3.text}")`);
check(h3.updates && h3.updates.some((u) => /13 December/.test(u.text)), "[no-event path] the 13 Dec line is kept underneath");
r = xf.placePost(road3, post("10", "SpaceX", "2026-12-12T08:00:00Z", "earlier: 12 December"), nc("SpaceX targets 12 December for Flight 16."));
check(/14 December/.test(h3.text), `[no-event path] an older post does not roll the box back ("${h3.text}")`);
console.log(fails ? `\n${fails} failed` : "\nall passed"); process.exit(fails ? 1 : 0);
