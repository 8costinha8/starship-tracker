// Offline tests for the 19 Oct missed-posts fixes (no network): link-card context, linked-article
// lead, link image fallback, "no verdict" retry, prompt rule for Flight N plans/readiness reports.
const road = require("./check-road.js"), xf = require("./x-first.js");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const r = { flight: 15, vehicles: ["B22", "S42"], categories: road.freshRoad(15).categories };
const stages = r.categories.map((c) => ({ id: c.id, name: c.name }));
// the real NSF teaser post of 18 Oct (2111860189670646174), as the X API returns it
const raw = { id: "2111860189670646174", author_id: "9", created_at: "2026-10-18T16:41:20.000Z",
  text: "SpaceX is preparing Flights 15 and 16 to close out 2026 for Starship, while documentation shows plans for a crazy future cadence at Starbase alone.\n\nhttps://t.co/NGlUxAjD2Y",
  entities: { urls: [{ url: "https://t.co/NGlUxAjD2Y", expanded_url: "https://www.nasaspaceflight.com/2026/10/spacex-flight-15-16-milestones/", unwound_url: "https://www.nasaspaceflight.com/2026/10/spacex-flight-15-16-milestones/",
    title: "SpaceX working through Starship Flight 15 and 16 milestones - NASASpaceFlight.com", description: "SpaceX is advancing toward its next two Starship missions as the company looks to close…",
    images: [{ url: "https://pbs.twimg.com/news_img/2111858941869084672/mLw4yAnd?format=jpg&name=orig", width: 1905, height: 1108 }] }] } };
const post = road.xPostCard(raw, {}, { 9: { id: "9", username: "NASASpaceflight", name: "NSF" } });
check(post.link && post.link.title.startsWith("SpaceX working through") && /nasaspaceflight\.com/.test(post.link.url) && /news_img/.test(post.link.image) && post.media.length === 0, "a link-only post keeps its link card (title, description, image)");
check(/entities/.test(new URLSearchParams({ f: "" }).toString() + JSON.stringify(require("./x-first.js").CLASSIFY_SCHEMA) + require("fs").readFileSync(__dirname + "/x-first.js", "utf8").match(/"tweet\.fields": "[^"]+"/)[0]), "the X search asks for entities (link cards)");
const html = `<html><script>var a="<p>no</p>";</script><p>SpaceX is advancing toward its next two Starship missions as the company looks to close out 2026. Flight 15 is targeting November, with the goal of catching both the booster and the Ship.</p><blockquote><p>embedded tweet text that should not count at all here</p></blockquote><p>Booster 22 is believed to have all of its engines installed and is awaiting transport to Pad 2 for its own pre-launch static fire.</p></html>`;
const lead = xf.articleLead(html);
check(/catching both the booster and the Ship/.test(lead) && /all of its engines installed/.test(lead) && !/embedded tweet|no<\/p>/.test(lead), "article lead: the opening paragraphs, without scripts or embeds");
(async () => {
  const fetched = [];
  const fetchFn = async (u) => { fetched.push(u); return { ok: true, text: async () => html }; };
  const other = { ...post, post_id: "2", link: { url: "https://example.com/a", title: "x" } };
  const many = [post, other, ...[3, 4, 5, 6].map((i) => ({ ...post, post_id: String(i), link: { ...post.link } }))];
  const n = await xf.readLinks(many, fetchFn);
  check(n === 3 && fetched.length === 3 && fetched.every((u) => /nasaspaceflight\.com/.test(u)) && !other.link.lead, "links read only for trusted outlets, at most 3 per run");
  const prompt = xf.classifyPrompt(r, [post], stages);
  check(/\[link: SpaceX working through Starship Flight 15 and 16 milestones[^\]]*catching both the booster and the Ship/.test(prompt), "the classifier sees the linked article's title and lead");
  check(/catch the booster and\/or the ship/.test(prompt) && /all engines installed/.test(prompt) && /long-term cadence plans/.test(prompt), "prompt: Flight N catch plans / readiness reports are road; only long-term plans are news");
  check(!/Flight 16|\${road\.flight \+ 1}/.test(prompt.split("Posts:")[0]), "no Flight 16 automation: the prompt only asks about the Road's own flight");
  const m = xf.postMedia(post);
  check(m && m.type === "photo" && /news_img/.test(m.url), "a link-only post's picture is its link card image (as X shows it); no play badge");
  // "no verdict" → one retry next run, then dropped
  const state = { xFirst: { sinceId: "1", seen: [], pending: [] } };
  const x1 = { ok: true, status: 200, json: async () => ({ data: [raw], meta: { newest_id: raw.id }, includes: { users: [{ id: "9", username: "NASASpaceflight", name: "NSF" }] } }) };
  const empty = { ok: true, status: 200, json: async () => ({ meta: {} }) };
  const logs = []; let calls = 0;
  const ask = async () => { calls++; return { entries: [] }; };
  const a = await xf.runXFirst(r, state, { token: "t", fetchFn: async () => x1, ask, postCard: road.xPostCard, log: (s) => logs.push(s) });
  check(a.state.pending.length === 1 && a.state.pending[0].retry === 1 && !a.state.seen.includes(raw.id) && logs.some((l) => /no verdict .* retried next run/.test(l)), "no verdict: the post waits for one more try (not lost as 'seen')");
  const b = await xf.runXFirst(r, { xFirst: a.state }, { token: "t", fetchFn: async () => empty, ask, postCard: road.xPostCard, log: (s) => logs.push(s) });
  check(calls === 2 && b.state.pending.length === 0 && b.state.seen.includes(raw.id), "second no verdict: dropped (no endless retries)");
  // a road verdict on the teaser post makes a card with the link image, credited once to the author
  const r2 = JSON.parse(JSON.stringify(r));
  const c = await xf.runXFirst(r2, state, { token: "t", fetchFn: async () => x1, postCard: road.xPostCard, log: () => {},
    ask: async () => ({ entries: [{ item: 1, kind: "road", stage: "pad", hardware: "B22", text: "Flight 15 will try to catch both Booster 22 and Ship 42.", status: null, event: null, reason: "catch plan" }] }) });
  const e = c.cards[0] && c.cards[0].entry;
  check(e && e.media_override && /news_img/.test(e.media_override.image) && e.media_override.author === "NASASpaceflight" && e.src === "@NASASpaceflight", "catch-plan card: link image, @NASASpaceflight");
  check(xf.xfQuery().length <= 512, `X query fits the 512-char search limit (${xf.xfQuery().length} chars)`);
  console.log(fails ? `\n${fails} FAILED` : "\n✅ All missed-post checks passed."); process.exit(fails ? 1 : 0);
})();
