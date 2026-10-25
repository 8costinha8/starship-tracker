// Offline tests for the Road to Flight N page cards: "Earlier updates" without a count, no standalone
// credit row, one "@handle · View on X ↗" line per post with a url, earlier-update pills that open
// their own post, and the Flight Log left exactly as it was.
//   node scripts/test-roadpage.js        exit 1 if any check fails
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const A_buLinked = (u) => { const src = app.match(/const buLinked = ([^\n]+);/)[1]; const isYouTube = (x) => /(^|\.)(youtube\.com|youtu\.be)$/i.test((() => { try { return new URL(x).hostname.replace(/^www\./, ""); } catch { return ""; } })()); return eval(src)(u); };
const fn = (name) => { const i = app.indexOf(`function ${name}(`); return i < 0 ? "" : app.slice(i, app.indexOf("\n}\n", i) + 2); };
const post = fn("FeedPost"), fbu = fn("FeedBuildUp"), credit = fn("CreditLine");

// 1. no count in the label
check(/<summary>Earlier updates<\/summary>/.test(fbu) && !/\(\$\{|\.length\}?\)/.test(fbu.split("\n").find((l) => /summary/.test(l))), "Road page: label reads 'Earlier updates' with no count");
check(/<FeedBuildUp h=\{h\}( plain=\{ONE_CARD\.includes\(cat\.id\)\})? \/>/.test(post) && !/<BuildUp /.test(post), "Road page cards use the Road build-up, not the Flight Log one");

// 2. no standalone credit row
check(/if \(!u\) return null;/.test(credit) && (post.match(/<CreditLine /g) || []).length === 1 && !/post-src|mini-src|srcOf\(h\)\}<\/span>/.test(post), "no standalone @handle credit row: a credit only ever sits in a View on X line");
check(!/xm-ctx|\{who\}<|&nbsp;·/.test(credit) && /\{isX \? "View on X" : "View source"\} \{LINK_ICON\}<\/a>/.test(credit) && /href=\{u\}/.test(credit), "View on X lines show no '@handle' text, only 'View on X ↗', and keep the link");
check(/\.buildup\.feed-bu ul \{ padding-left: 0; margin-left: 0; margin-right: 0;/.test(app) && /\.feed-bu \.bu-pill \{ box-sizing: border-box; width: 100%; \}/.test(app), "pill CSS: no list indent, full width (browser check measures it against the image)");

// 3. one View on X line per post with a url: under the main post (above Earlier updates), and in each update pill
check(post.indexOf("<CreditLine h={h} />") > 0 && post.indexOf("<CreditLine h={h} />") < post.indexOf("<FeedBuildUp"), "main post's View on X line sits under its media, above Earlier updates");
check(/url \? <li[^]*?<CreditLine h=\{\{ url, src: handleOf\(u\) \}\} \/><\/li>\s*: <li key=\{i\}>\{body\}<\/li>/.test(fbu), "each earlier update with a url gets its own line; one without a url gets none");
const H = new Function(`const isYouTube = (u) => /youtube|youtu\\.be/.test(u || ""); ${app.slice(app.indexOf("const handleOf ="), app.indexOf("function FeedBuildUp("))} return handleOf;`)();
check(H({ url: "https://x.com/LabPadre/status/1" }) === "@LabPadre" && H({ handle: "LabPadre", url: "https://x.com/a/status/1" }) === "@LabPadre" && H({ url: "https://www.nasaspaceflight.com/x" }) === null, "handle from the update's handle, else its x.com url");

// 4. the earlier-update pill links to its url
const cryo = live.categories.find((c) => c.id === "cryo"), s42 = cryo.history.find((h) => h.date && h.date.startsWith("9 Oct"));
const u = s42.updates.find((x) => x.date === "3–4 Sep");
check(u && u.url === "https://x.com/LabPadre/status/2095620292823462214" && u.handle === "LabPadre", "3–4 Sep S42 update carries LabPadre's 3 Sep post (url + handle)");
check(/className="bu-pill" role="link" tabIndex=\{0\} data-url=\{url\}/.test(fbu) && /openUrl\(url\)/.test(fbu) && /\.feed-bu li\.bu-pill \{[^}]*border: 1px solid/.test(app), "a whole bordered pill opens its own post (click + Enter)");
const urls = live.categories.flatMap((c) => (c.history || []).flatMap((h) => h.updates || [])).map((x) => x.url).filter((x) => /x\.com\//.test(x || ""));
check(urls.every((x) => /^https:\/\/x\.com\/\w+\/status\/\d+$/.test(x)), `every X url on an update is a real status link (${urls.length})`);

// 5. the Flight Log is unchanged
const cssLog = app.split("\n").filter((l) => /^\.road[ .{]|^\.mini|^\.buildup/.test(l) && !/feed-bu/.test(l)).join("\n");
const logHash = crypto.createHash("sha1").update(fn("RoadCard") + cssLog).digest("hex"); if (process.env.SHOW_HASH) console.log(logHash);
check(logHash === "42cc4eca670f40f31fee5f03b2a24d930632ea02", "Flight Log card code and CSS byte-identical to the Flight Log view redesign (was 04a48c2)");
check(/<summary>Earlier updates<\/summary>/.test(fn("BuildUp")) && /\.buildup:not\(\.feed-bu\) summary \{ display: inline-flex; align-items: center; gap: 4px;/.test(app) && !/<a /.test(fn("BuildUp").split(": <li key={i}><div")[0]), "Flight Log build-up has no count, chevron inline at text height; a new X url doesn't turn its line into a link");
// Flight Log earlier updates: no @handle chips; a post-backed line is an invisible tap area → Road to Flight card; others inert
{ const B = fn("BuildUp"), css = app.split("\n").filter((l) => /li\.bu-tap/.test(l)).join("\n");
  check(!/mini-src|handleOf/.test(B), "Flight Log earlier updates: no @handle chips on any category");
  check(/log && onTap && buLinked\(u\)/.test(B) && /onTap\(u\)/.test(B) && /className: "bu-plain" \}/.test(B), "post-backed line taps through to the Road to Flight card; a line with no post gets no handler");
  check(/e\.stopPropagation\(\); e\.preventDefault\(\); onTap\(u\)/.test(B), "tapping a line never toggles the Earlier updates collapse or the card");
  check(/cursor: pointer/.test(css) && !/border:|background:|text-decoration: underline|box-shadow/.test(css.split("\n").filter((l) => !/focus-visible/.test(l)).join("")), "tap area is invisible: pointer only, no box, border or underline");
  check(!/cursor/.test(app.split("\n").filter((l) => /li\.bu-plain/.test(l)).join("")), "lines with no linked post: no pointer cursor");
  check(A_buLinked({ url: "https://x.com/a/status/1" }) && A_buLinked({ handle: "x" }) && !A_buLinked({ url: "https://www.youtube.com/watch?v=1" }) && !A_buLinked({ text: "no post" }), "linked = an X/post url or handle (YouTube and source-less lines are inert)"); }

// 6. ship cryo cards: standing default photo, still linking to the X post; booster cryo unchanged
const R = new Function(`const isYouTube = (u) => /youtube|youtu\\.be/.test(u || ""); ${app.slice(app.indexOf("const urlOf ="), app.indexOf("\n", app.indexOf("const urlOf =")))}\n${app.slice(app.indexOf("const SHIP_CRYO_IMAGE ="), app.indexOf("function FeedPost("))} return roadMediaOf;`)();
const cc = { id: "cryo" }, s42m = R(s42, cc);
check(fs.existsSync(path.join(ROOT, "images/ship-cryo.jpg")) && s42m && s42m.image === "images/ship-cryo.jpg" && s42m.type === "photo" && s42m.post_url === "https://x.com/LabPadre/status/2108486994401825101", "S42 cryo card shows images/ship-cryo.jpg and still links to its X post");
check(R({ text: "Ship 43 completed a cryo proof test.", x_post: { url: "https://x.com/a/status/1" } }, cc).image === "images/ship-cryo.jpg", "a future auto-created ship cryo card gets the default photo");
const b23 = cryo.history.find((h) => /Booster 23 completed/.test(h.text));
check(R(b23, cc) === b23.media_override && R({ text: "Ship 42 raptors", media_override: b23.media_override }, { id: "raptor" }) === b23.media_override, "booster cryo and non-cryo cards keep their own picture");
check(R({ text: "Ship 42 cryo", media_override: { image: "x.jpg", keep_image: true } }, cc).image === "x.jpg" && /keep_image: true/.test(fs.readFileSync(path.join(__dirname, "check-road.js"), "utf8")), "a manual pick with keep_image overrides the default");
check(/\{mo \? <PickMedia mo=\{mo\} \/>/.test(post) && !/roadMediaOf|SHIP_CRYO/.test(fn("RoadCard")), "Road page uses it; Flight Log box untouched");

// 7. main View on X shares the Earlier updates row (toggle left, link right), 8px under the image; pills padded 13px
check(/\.post > \.post-credit \{ margin-top: 10px;/.test(app) && /\.post > \.post-credit:has\(\+ \.feed-bu\) \{ float: right;/.test(app) && /\.post > \.buildup\.feed-bu > summary \{ display: flex; align-items: center; justify-content: space-between;/.test(app), "View on X on the Earlier updates row, right-aligned; alone it stays right under the image (8px)");
check(/\.buildup\.feed-bu li\.bu-pill \{ padding: 12px 16px;/.test(app) && /\.feed-bu \.bu-pill \{ box-sizing: border-box; width: 100%; \}/.test(app), "earlier-update pills have 13px inner padding and keep the image width");

check(/li\.bu-pill \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/.test(app) && /\.bu-pill > \.post-credit \{ grid-column: 2; grid-row: 1;/.test(app) && /\.bu-pill > \.bu-text \{ grid-column: 1 \/ -1; grid-row: 2; \}/.test(app) && /\.post > \.xm \{ margin-top: 8px; \}/.test(app) && /\.post > \.post-text \{ margin-top: 10px; \}/.test(app), "compact pill: View on X on the date line, right; text+image centred, close together");
console.log(fails ? `❌ ${fails} failed` : "✅ All Road page checks passed.");
process.exit(fails ? 1 : 0);
