// Road to Flight card picture: newest event with a picture, best photo among that event's posts.
const assert = require("assert");
const { cardPicture, kindOf } = require("./road-pick.js");
const post = (id, at, text, handle, media) => ({ id, at, text, x_post: { url: `https://x.com/${handle}/status/${id}`, author: { username: handle }, media } });
const photo = (u) => ({ type: "photo", url: u }), video = (u) => ({ type: "video", poster: u });
const a = post("1", "2026-10-24T08:00:00Z", "Booster 22 rolled out to Pad 2.", "Blobifie", [video("v1")]);
const b = post("2", "2026-10-24T09:00:00Z", "Booster 22 rolling out to the pad.", "randomfan", [photo("p2")]);
const c = post("3", "2026-10-24T10:00:00Z", "Booster 22 rollout to Pad 2 underway.", "LabPadre", [photo("p3")]);
const old = post("4", "2026-10-20T10:00:00Z", "Booster 22 arrived at Massey's.", "LabPadre", [photo("p4")]);
let r = cardPicture([old, a, b, c], { cid: "static" });
assert.strictEqual(r.image, "p3", "same event: tier 2 photo beats tier 3 photo and a video thumbnail");
r = cardPicture([old, a], { cid: "static" });
assert.strictEqual(r.image, "v1", "only a video thumbnail in the newest event: use it");
const none = post("5", "2026-10-25T10:00:00Z", "Booster 22 lifted onto the launch mount.", "LabPadre", []);
r = cardPicture([old, none], { cid: "pad" });
assert.strictEqual(r.image, "p4", "newest event without a picture: next newest event that has one");
assert.strictEqual(cardPicture([none], { cid: "pad" }), null, "no picture anywhere: null (placeholder)");
const sf1 = post("6", "2026-10-25T13:00:00Z", "Booster 22 conducted a static fire test.", "Blobifie", [video("v6")]);
const sf2 = post("7", "2026-10-25T14:00:00Z", "Booster 22 static fire on Pad 2.", "SpaceX", [photo("p7")]);
r = cardPicture([sf1, sf2, c], { cid: "static", done: sf1 });
assert.strictEqual(r.image, "p7", "completed: best of the completing event's posts (SpaceX photo)");
const man = { ...sf1, media_override: { image: "images/pick.jpg", keep_image: true, author: "Blobifie" } };
assert.strictEqual(cardPicture([man, sf2], { cid: "static", done: man }).image, "images/pick.jpg", "a manual keep_image pick always wins");
// X post media over news-site pictures (B22 static fire, 31 Oct): a manual NSF-clip frame or an NSF article/link image
// never beats a Tier 1/2 X post's own media of the same event, on any card or vehicle.
const nsfPick = post("8", "2026-10-25T13:22:00Z", "Booster 22 conducted a static fire test on Pad 2.", "NASASpaceflight", [video("nsfthumb")]);
nsfPick.media_override = { image: "images/b22-static-fire.jpg", keep_image: true, author: "NASASpaceflight", type: "video" };
const spx = post("9", "2026-10-25T19:49:01Z", "Booster 22 completed a full-duration 33-engine static fire.", "SpaceX", [video("spxthumb")]);
r = cardPicture([nsfPick, spx], { cid: "static", done: nsfPick });
assert.strictEqual(r.image, "spxthumb", "X post media (SpaceX) beats a manual NSF frame on the completed card");
assert.strictEqual(r.author, "SpaceX", "credited to the X post's author");
const shipNews = { id: "10", at: "2026-10-27T21:45:00Z", text: "Ship 42 static fire at Massey's.", url: "https://www.nasaspaceflight.com/2026/10/s42-sf/", media_override: { image: "https://www.nasaspaceflight.com/wp-content/uploads/s42.jpg", type: "photo" } };
const shipX = post("11", "2026-10-27T22:05:00Z", "Ship 42 six-engine static fire.", "TrackingTheSB", [video("tsbthumb")]);
assert.strictEqual(cardPicture([shipNews, shipX], { cid: "static", done: shipNews }).image, "tsbthumb", "ship card too: Tier 2 X video beats a news-site photo");
assert.strictEqual(cardPicture([shipNews], { cid: "static", done: shipNews }).image.includes("nasaspaceflight.com"), true, "news-site image still used when no X media exists");
assert.strictEqual(kindOf("cryo", "Frost on Ship 42's tanks"), "cryo");
console.log("test-roadpick: all passed");
