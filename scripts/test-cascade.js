/* Milestone media cascade: one check per rule. Fake frame picker, no network, no writer, no X calls. */
const mc = require("./media-cascade.js"), cfg = require("./config.js"), mw = require("./media-watch.js");
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? "✅" : "❌"} ${msg}`); if (!ok) fails++; };
const T0 = Date.parse("2026-10-27T21:45:25Z"), H = 3600000;
const card = (over = {}) => ({ id: "x-1", date: "27 Oct", at: new Date(T0).toISOString(), text: "Ship 42 completed a six-engine static fire test.", x_text: "Ship 42 completed a six-engine static fire test.",
  url: "https://x.com/someone/status/1", src: "@someone", x_post: { post_id: "1", author: { username: "someone" } }, media_override: { post_id: "1", author: "someone", image: "https://img/1.jpg", type: "photo" }, ...over });
const road = (h, id = "static") => ({ categories: [{ id, name: "Static fires", history: [h] }] });
const post = (id, user, text, dtH = 1, media = [{ type: "video", video_url: `v${id}.mp4`, poster: `p${id}.jpg` }]) => ({ post_id: String(id), url: `https://x.com/${user}/status/${id}`, created_at: new Date(T0 + dtH * H).toISOString(), author: { username: user }, text, media });
const lit = async (p) => ({ image: `images/${p.post_id}-frame.jpg`, lit: true, score: 0.9, frame: { t: 9 } });
const dark = async () => ({ image: "images/dark.jpg", lit: false, score: 0.9 });
const opts = (o = {}) => ({ now: T0 + 2 * H, frameFor: lit, ...o });
const SF = "Ship 42 conducts a six-engine static fire test.";
(async () => {
  check(cfg.ASSESS_WINDOW_DAYS === 2, "config: ASSESS_WINDOW_DAYS = 2");
  check(mc.tierOf("SpaceX") === 1 && mc.tierOf("NASASpaceflight") === 2 && mc.tierOf("randomfan") === 3, "tiers: SpaceX 1, NSF 2, others 3");

  // same-event fallback without the writer
  check(mc.sameEvent(card(), post(2, "NASASpaceflight", SF)), "same event: vehicle + static fire + within 36h");
  check(!mc.sameEvent(card(), post(3, "NASASpaceflight", "Ship 43 conducts a static fire test.")), "different vehicle → not the same event");
  check(!mc.sameEvent(card(), post(4, "NASASpaceflight", "Ship 42 rolls out to the launch site.")), "different event type → not the same event");
  check(!mc.sameEvent(card(), post(5, "NASASpaceflight", SF, 72)), "3 days later → not the same event");

  // tier 2 confirms, swaps image AND link AND source post, keeps the text, no caption
  let h = card(), r = await mc.runCascade(road(h), [post(10, "NASASpaceflight", SF)], opts());
  check(r.swapped.length === 1 && h.url === "https://x.com/NASASpaceflight/status/10" && h.x_post.post_id === "10" && h.media_override.post_id === "10" && h.media_override.image === "images/10-frame.jpg", "tier 2 swap: image + link + source post");
  check(h.text === "Ship 42 completed a six-engine static fire test." && h.text_locked === true, "wording kept and locked on confirmation");
  check(!("caption" in h) && !h.media_context && !Object.keys(h.media_override).some((k) => /caption|label/.test(k)), "no caption or label on the image");
  check(h.at === new Date(T0).toISOString(), "earliest trusted time kept (later post does not move it)");

  // earlier trusted post → earlier time
  h = card(); await mc.runCascade(road(h), [post(11, "NASASpaceflight", SF, -0.5)], opts());
  check(h.at === new Date(T0 - 0.5 * H).toISOString(), "an earlier tier 2 post moves the time earlier");

  h = card(); await mc.runCascade(road(h), [post(14, "NASASpaceflight", SF, -19)], opts());
  check(h.at === new Date(T0).toISOString(), "an earlier separate firing (19h before) does not move the card time");
  // tier 3 only: first signal, media held, not confirmed
  h = card({ src: "@fan1", x_post: { post_id: "1", author: { username: "fan1" } }, media_override: { post_id: "1", author: "fan1", image: "https://img/1.jpg", type: "photo" } });
  r = await mc.runCascade(road(h), [post(12, "fan1", SF)], opts());
  check(!h.cascade.confirmed && !r.swapped.length && h.url === "https://x.com/someone/status/1", "one tier 3 source: not confirmed, Road media held");
  // two distinct sources confirm; still no tier 3 media
  r = await mc.runCascade(road(h), [post(13, "fan2", SF)], opts());
  check(h.cascade.confirmed && h.text_locked && !r.swapped.length, "two sources confirm (wording locks), tier 3 media still never shown");

  // cascade follows quality: tier 2 then tier 1 (SpaceX, outside the window too)
  h = card(); await mc.runCascade(road(h), [post(20, "NASASpaceflight", SF)], opts());
  r = await mc.runCascade(road(h), [post(21, "LabPadre", SF, 3)], opts());
  check(!r.swapped.length && h.x_post.post_id === "20", "same-tier same-quality candidate: no swap");
  r = await mc.runCascade(road(h), [post(22, "SpaceX", SF, 30)], opts({ now: T0 + 3 * 86400000 }));
  check(r.swapped.length === 1 && h.x_post.post_id === "22" && h.src === "@SpaceX", "SpaceX swaps in immediately, even after the window");
  h = card(); await mc.runCascade(road(h), [post(23, "NASASpaceflight", SF)], opts());
  r = await mc.runCascade(road(h), [post(24, "LabPadre", SF, 30)], opts({ now: T0 + 3 * 86400000, frameFor: async (p) => ({ image: "x.jpg", lit: true, score: 5 }) }));
  check(!r.swapped.length && /window/.test(r.skipped.join()), "tier 2 after the 2-day window: no swap");

  // engines must be lit for a static fire video
  h = card(); r = await mc.runCascade(road(h), [post(30, "NASASpaceflight", SF)], opts({ frameFor: dark }));
  check(!r.swapped.length && /engine-lit/.test(r.skipped.join()), "static fire: a frame without lit engines is never swapped in");

  // locks
  h = card({ media_override: { post_id: "1", author: "someone", image: "a.jpg", keep_image: true } }); r = await mc.runCascade(road(h), [post(40, "NASASpaceflight", SF)], opts());
  check(!r.swapped.length && h.media_override.image === "a.jpg", "keep_image respected");
  h = card({ media_override: { post_id: "99", author: "colleenadastra", image: "b.jpg" } }); r = await mc.runCascade(road(h), [post(41, "NASASpaceflight", SF)], opts({ picks: [{ post_id: "99" }] }));
  check(!r.swapped.length && h.media_override.image === "b.jpg", "manual pick (road-media.json) respected");
  check(mw.lockedReason({ media_override: { cascade: true, auto: true } }, "static", new Set()) === "milestone cascade manages this card", "media-watch leaves cascade cards alone");

  // never a push, no X calls
  h = card(); let calls = 0; const realFetch = global.fetch; global.fetch = async () => { calls++; throw new Error("no network"); };
  const rd = road(h); r = await mc.runCascade(rd, [post(50, "NASASpaceflight", SF)], opts());
  global.fetch = realFetch;
  check(calls === 0 && !("notifications" in r) && !("pushes" in r) && r.swapped.length === 1, "a swap makes no network/X call and returns no push");
  const src = require("fs").readFileSync(__dirname + "/media-cascade.js", "utf8");
  check(!/sendPush|notifications\.push|api\.x\.com|askJson/.test(src), "cascade code has no push, no X API, no writer");
  const cr = require("fs").readFileSync(__dirname + "/check-road.js", "utf8");
  check(/runCascade\(road, xf\.posts/.test(cr), "check-road feeds the cascade the posts X-first already fetched");

  // x-first respects the wording lock
  const xs = require("fs").readFileSync(__dirname + "/x-first.js", "utf8");
  check(/if \(h\.text_locked\)/.test(xs), "x-first merge keeps a locked card's wording");

  console.log(fails ? `\n❌ ${fails} check(s) failed.` : "\nAll cascade checks passed.");
  process.exit(fails ? 1 : 0);
})();
