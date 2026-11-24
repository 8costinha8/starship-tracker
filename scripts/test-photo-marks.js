// Photo source rules (scripts/photo-marks.js).   node scripts/test-photo-marks.js
//  v5: a photo with its source's logo burned in (in the crop) shows no round badge on top (one logo, not two)
//  v6: the badge is the CREDITED original source when the post names one, else the posting account
const fs = require("fs"), path = require("path");
const M = require("./photo-marks.js");
const ROOT = path.join(__dirname, "..");
let pass = 0, fail = 0; const check = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✅" : "❌"} ${m}`); };
// ── marks: window maths on a sample mark (the RGV livestream thumb's logo spot, top right of a 1200x675 frame)
const RGV = { match: "OZnACetsr9Q5nFho", handle: "RGVaerialphotos", w: 1200, h: 675, box: [0.895, 0.03, 0.98, 0.184] };
const img = "https://pbs.twimg.com/amplify_video_thumb/2124764895292133376/img/OZnACetsr9Q5nFho.jpg";
check(M.hideBadge(img, 16 / 9, "top", [RGV]), "a recorded logo inside the 16:9 crop → no round badge");
check(!M.hideBadge(img, 0.6, "top", [RGV]), "the same logo cropped off (narrow 0.6 slot) → the badge stays");
check(!M.hideBadge("https://pbs.twimg.com/media/unmarked.jpg"), "a photo with no recorded mark keeps its badge");
const w = M.windowOf(1600, 900, 1, "top"); check(Math.abs(w[0] - 0.21875) < 1e-6 && Math.abs(w[2] - 0.78125) < 1e-6 && w[1] === 0 && w[3] === 1, "cover window: 16:9 photo in a square slot keeps the middle 56%");
check(M.creditOf("", { poster: "Someone", image: img, marks: [RGV] }).handle === "RGVaerialphotos", "a visible recorded mark is the credited source");
// v6: a source mark is the CREDIT whether or not it is in the crop; it hides the badge only when it is in the crop
const NSFcut = { match: "cut.jpg", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1280, h: 720, box: null };
check(M.creditOf("no credit text", { poster: "Blobifie", image: "x/cut.jpg", marks: [NSFcut] }).handle === "NASASpaceflight" && !M.hideBadge("x/cut.jpg", 16 / 9, "top", [NSFcut]), "a reposted stream still whose mark we cropped off → the stream's (NSF) badge, shown");
check(M.creditOf("", { poster: "Someone", image: img, marks: [RGV], aspect: 0.6 }).handle === "RGVaerialphotos" && !M.hideBadge(img, 0.6, "top", [RGV]), "a mark cropped off by the slot still credits its account (badge shown with that logo)");
const live = ["data/vehicles.json", "road.json"].map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
for (const m of M.MARKS) {
  check((m.box === null || (m.box.every((v) => v >= 0 && v <= 1) && m.box[0] < m.box[2] && m.box[1] < m.box[3])) && m.w > 0 && m.h > 0 && m.handle && m.name, `mark ${m.match} (${m.handle}): box (or null = cut off) and size are valid`);
  check(live.includes(m.match), `mark ${m.match} (${m.handle}): its photo is in the live data`);
}
// ── B24 cryo: Bernardo's pick (option 3, NSF Starbase Live still posted by @Blobifie), locked, no NSF mark left in the crop
const picks = JSON.parse(fs.readFileSync(path.join(ROOT, "road-media.json"), "utf8")).picks;
const b24 = picks.find((p) => p.image === "images/b24-cryo-blobifie-nsf-clean.jpg");
check(b24 && b24.keep_image && b24.picked_by === "Bernardo" && b24.post_id === "2124725822909219049" && Array.isArray(b24.vehicle_box), "B24 cryo pick recorded: keep_image, picked_by Bernardo, Blobifie 2124725822909219049, vehicle_box stored");
check(fs.existsSync(path.join(ROOT, b24 ? b24.image : "x")) && fs.statSync(path.join(ROOT, b24.image)).size < 150e3, "B24 picture saved under images/ and web-sized (< 150 KB)");
const b24m = M.markOf(b24 && b24.image);
check(b24m && b24m.handle === "NASASpaceflight" && b24m.box === null, "B24 pick recorded as an NSF Starbase Live still, mark cut off in our crop (box null)");
check(M.creditOf("Super heavy boosters only do this when they are very happy https://t.co/x", { poster: "Blobifie", image: b24.image }).handle === "NASASpaceflight" && !M.hideBadge(b24.image), "B24 cryo badge: NSF's logo (the stream is the source; @Blobifie only reposted it), shown because no NSF mark is in the crop");
const fl = JSON.parse(fs.readFileSync(path.join(ROOT, "data/vehicles.json"), "utf8"));
const ev = ((fl.vehicles.B24 || {}).events || []).find((e) => e.id === "fv-3fd642c695") || {};
check(ev.media_override && ev.media_override.image === b24.image && ev.media_override.keep_image && /Bernardo/.test(ev.media_override.picked_by + ev.media_override.note), "registry event fv-3fd642c695 (B24 cryo done) carries the pick");
// every lock on a registry event has a recorded Bernardo pick (media-lock rule, registry side)
const bern = (p) => /bernardo/i.test(String(p.picked_by || "")) || /\bBernardo\b/.test(String(p.note || ""));
for (const v of Object.values(fl.vehicles)) for (const e of v.events || []) if (e.media_override && e.media_override.keep_image)
  check(picks.some((p) => bern(p) && p.keep_image && p.image === e.media_override.image), `registry lock ${e.id} (${v.id}) has a recorded Bernardo pick`);
// ── credit rule
const C = (t, poster) => M.creditOf(t, { poster });
check(C("Starship 43 … the launch site.\n\nFor WAI Media @FelixSchlang https://t.co/x", "mymatrixplug").handle === "FelixSchlang", "\"For WAI Media @FelixSchlang\" → @FelixSchlang (WAI Media's logo), not the poster @mymatrixplug");
check(C("👀 SHIP 43 AT MASSEY'S\n\n📷 Oct 23. @Jordanguidry6 - WAI Media https://t.co/x", "FelixSchlang").handle === "FelixSchlang", "S43 cryo \"📷 … @Jordanguidry6 - WAI Media\" → WAI Media @FelixSchlang: the same logo as the S43 Pad photo");
check(C("Ship 43 has entered Megabay 2.\n\n📷NSF | Starbase Live | https://t.co/x", "TrackingTheSB").handle === "NASASpaceflight", "\"📷NSF | Starbase Live\" → @NASASpaceflight");
check(C("Booster 23 … \n\n📸@NASASpaceflight | Starbase Live | https://t.co/x", "TrackingTheSB").handle === "NASASpaceflight", "\"📸@NASASpaceflight\" → @NASASpaceflight");
check(C("Ship 43 has departed Production … via @LabPadre https://t.co/x", "Bettybronxton").handle === "LabPadre", "\"via @LabPadre\" → @LabPadre");
check(C("Crews back at work on Pad 2.\n\n📸Casper Harris | Starship Tracking", "TrackingTheSB").handle === "TrackingTheSB", "\"📸Casper Harris | Starship Tracking\" → the poster's own agency (@TrackingTheSB)");
const av = C("Two Raptor engines … \n\n📸Avidspace https://t.co/x", "Flight2Starship"); check(av.handle === "Flight2Starship" && av.unresolved && av.name === "Avidspace", "a named credit with no known account (\"📸Avidspace\") falls back to the poster, flagged unresolved");
check(C("Photo by @someone_else", "poster").handle === "someone_else" && C("Booster 24 left for static fire testing", "poster").handle === "poster" && C("S42 then departed for the Massey outpost, for static fire testing", "LabPadre").handle === "LabPadre", "\"photo by @X\" → X; an ordinary \"for …\" in a sentence is not a credit");
check(C("Super heavy boosters only do this when they are very happy https://t.co/x", "Blobifie").via === "poster", "no credit in the post → the posting account");
// ── every stored photo post: entry shape, and the badge credit the app will draw
const cr = JSON.parse(fs.readFileSync(path.join(ROOT, "data/photo-credits.json"), "utf8")).posts;
check(Object.keys(cr).length >= 40 && Object.entries(cr).every(([id, r]) => /^\d{15,}$/.test(id) && r.poster && typeof r.text === "string"), `data/photo-credits.json: ${Object.keys(cr).length} photo posts with poster + text`);
const sid = (u) => (String(u || "").match(/status\/(\d{15,})/) || [])[1];
check(picks.filter((p) => p.image && !p.credit_only).every((p) => cr[p.post_id || sid(p.post_url)]), "every road-media.json photo pick has its post text stored");
// reposted NSF Starbase Live stills (audit 24 Nov v6): the badge is NSF, not the reposter; visible marks hide it
for (const [u, poster, hidden] of [["https://pbs.twimg.com/media/HVWEyTyaQAA-KCA.jpg", "Blobifie", true], ["https://pbs.twimg.com/media/HVmQW1fbIAA2hgT.jpg", "Blobifie", true], ["https://pbs.twimg.com/media/HVsYHvSaQAAzZ3c.jpg", "TrackingTheSB", false], ["https://pbs.twimg.com/amplify_video_thumb/2123894070829559808/img/fBDA16Mj6GuEouvs.jpg", "efraser77", true]])
  check(M.creditOf("", { poster, image: u }).handle === "NASASpaceflight" && M.hideBadge(u) === hidden, `${u.split("/").pop()} (posted by @${poster}): credit @NASASpaceflight, badge ${hidden ? "hidden (NSF mark in the crop)" : "shown with NSF's logo (mark below the crop)"}`);
const exp = { "2114815133700731141": "FelixSchlang", "2114533727514640403": "FelixSchlang", "2110889490336350574": "StarshipGazer", "2123269690457780726": "TrackingTheSB", "2115315741709001123": "NASASpaceflight", "2113350505065836569": "LabPadre" };
for (const [id, h] of Object.entries(exp)) check(cr[id] && C(cr[id].text, cr[id].poster).handle === h, `post ${id} (@${cr[id] && cr[id].poster}) badge → @${h}`);
// the credited accounts with a logo on the cards have their avatar saved
const avs = JSON.parse(fs.readFileSync(path.join(ROOT, "icons/avatars/index.json"), "utf8")).avatars;
check(["felixschlang", "nasaspaceflight", "labpadre"].every((h) => avs[h]), "credited accounts have saved avatars (FelixSchlang, NASASpaceflight, LabPadre)");
// the app asks PhotoMarks for the credit and the mark before drawing the badge
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
check(/P\.creditOf\(rec \? rec\.text : "", \{ poster: poster \|\| \(rec && rec\.poster\) \|\| "", image, aspect, crop \}\)/.test(app) && /const h = cred\.handle;/.test(app) && /markHidesBadge\(image, aspect, crop\)\) return null/.test(app) && /fetch\("data\/photo-credits\.json"\)/.test(app), "SrcBadge: credited source (creditOf on the stored post text), hidden when a mark is in the crop");
check(/<script defer src="scripts\/photo-marks\.js"><\/script>/.test(idx), "index.html loads scripts/photo-marks.js");
console.log(`\n${pass}/${pass + fail} checks passed`); if (fail) process.exit(1);
