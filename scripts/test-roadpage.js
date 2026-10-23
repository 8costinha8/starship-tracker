// Offline tests for the Road to Flight N page cards: "Earlier updates" without a count, no standalone
// credit row, one "@handle · View on X ↗" line per post with a url, earlier-update pills that open
// their own post, and the Flight Log left exactly as it was.
//   node scripts/test-roadpage.js        exit 1 if any check fails
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
let fails = 0; const check = (ok, m) => { console.log((ok ? "✅ " : "❌ ") + m); if (!ok) fails++; };
const live = JSON.parse(fs.readFileSync(path.join(ROOT, "road.json"), "utf8"));
const app = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const fn = (name) => { const i = app.indexOf(`function ${name}(`); return i < 0 ? "" : app.slice(i, app.indexOf("\n}\n", i) + 2); };
const post = fn("FeedPost"), fbu = fn("FeedBuildUp"), credit = fn("CreditLine");

// 1. no count in the label
check(/<summary>Earlier updates<\/summary>/.test(fbu) && !/\(\$\{|\.length\}?\)/.test(fbu.split("\n").find((l) => /summary/.test(l))), "Road page: label reads 'Earlier updates' with no count");
check(/<FeedBuildUp h=\{h\} \/>/.test(post) && !/<BuildUp /.test(post), "Road page cards use the Road build-up, not the Flight Log one");

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
check(/className="bu-pill" role="link" tabIndex=\{0\} data-url=\{url\}/.test(fbu) && /openUrl\(url\)/.test(fbu) && /\.feed-bu \.bu-pill \{[^}]*border: 1px solid/.test(app), "a whole bordered pill opens its own post (click + Enter)");
const urls = live.categories.flatMap((c) => (c.history || []).flatMap((h) => h.updates || [])).map((x) => x.url).filter((x) => /x\.com\//.test(x || ""));
check(urls.every((x) => /^https:\/\/x\.com\/\w+\/status\/\d+$/.test(x)), `every X url on an update is a real status link (${urls.length})`);

// 5. the Flight Log is unchanged
const cssLog = app.split("\n").filter((l) => /^\.road[ .{]|^\.mini|^\.buildup/.test(l) && !/feed-bu/.test(l)).join("\n");
check(crypto.createHash("sha1").update(fn("RoadCard") + cssLog).digest("hex") === "de296c94e36b0c9faa3595f69043966201f45bbc", "Flight Log card code and CSS byte-identical to 04a48c2");
check(/<summary>\{`Earlier updates \(\$\{ups\.length\}\)`\}<\/summary>/.test(fn("BuildUp")) && /u\.url && !\(log && u\.handle\)/.test(fn("BuildUp")), "Flight Log build-up keeps its count; a new X url doesn't turn its line into a link");

console.log(fails ? `❌ ${fails} failed` : "✅ All Road page checks passed.");
process.exit(fails ? 1 : 0);
