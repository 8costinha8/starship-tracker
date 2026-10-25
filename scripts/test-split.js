// Two-photo split on Road cards: data, Grok pair rules + code guards, and a 390x844 render check.
// The browser check runs when playwright + Chrome are available (PLAYWRIGHT_PATH to a node_modules/playwright dir).
const fs = require("fs"), path = require("path"), http = require("http");
const root = path.join(__dirname, ".."), app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const mwm = require("./media-watch.js");
let pass = 0, fail = 0; const check = (ok, msg) => { ok ? pass++ : fail++; console.log((ok ? "✅ " : "❌ ") + msg); };
const road = JSON.parse(fs.readFileSync(path.join(root, "road.json"), "utf8"));
const all = road.categories.flatMap((c) => (c.history || []).map((h) => ({ c, h })));
const b22 = all.find((x) => x.h.id === "x-2113907865060819060");
check(b22 && b22.h.alt_media && b22.h.alt_media.show === true && /HVZoSvdakAAst89/.test(b22.h.alt_media.image) && /Blobifie/.test(b22.h.alt_media.post_url)
  && /HVZzuQbXQAAUzqy/.test(b22.h.media_override.image) && b22.h.media_override.author === "colleenadastra", "B22 Pad-2 card: LEFT Blobifie wide shot, RIGHT Colleen close-up");
check(all.filter((x) => x.h.alt_media && x.h.alt_media.show === true).length >= 1 && all.every((x) => !x.h.media2), "second picture lives in alt_media (show flag); no third field");
check(/\[h\.alt_media, mo\]\.slice\(0, 2\)/.test(app) && mwm.MAX_IMAGES === 2, "cap: never more than 2 pictures");
check(/mo \? <PickMedia mo=\{mo\} \/>/.test(app), "single-image cards keep the same PickMedia path");
(async () => {
  // code guards: static fire / rollout / cryo never get 2, whatever the model says
  const yes = { pair: async () => ({ two: true, confidence: 0.99, reason: "x" }) };
  const A = { image: "a.jpg" }, B = { image: "b.jpg" };
  for (const t of ["Booster 22 completed its static fire at the launch site.", "Ship 43 rolled out to Massey's.", "Ship 43 cryo test underway.", "Booster 23 spin prime."])
    check(!(await mwm.decidePair(yes, { text: t }, { id: "static" }, A, B)), `guard: "${t}" → 1 picture`);
  check(!(await mwm.decidePair(yes, { text: "Ship 43 on the stand." }, { id: "cryo" }, A, B)), "guard: cryo section → 1 picture");
  check(await mwm.decidePair(yes, { text: "Booster 22 is being lifted onto Pad-2." }, { id: "static" }, A, B), "lift with a sure, different angle → 2");
  check(!(await mwm.decidePair({ pair: async () => ({ two: true, confidence: 0.8 }) }, { text: "Booster 22 is being lifted onto Pad-2." }, { id: "pad" }, A, B)), "confidence below 0.9 → 1");
  check(!(await mwm.decidePair(yes, { text: "Booster 22 lift." }, { id: "pad" }, A, A)), "same image twice → 1");
  check(/static fire/.test(mwm.pairPrompt("x", "y")) && /Default: false/.test(mwm.pairPrompt("x", "y")) && /rollout/.test(mwm.pairPrompt("x", "y")) && /cryo/.test(mwm.pairPrompt("x", "y")), "prompt: default 1, single-shot events always 1");
  // media-watch never pushes: the split decision only edits alt_media
  const src = fs.readFileSync(path.join(__dirname, "media-watch.js"), "utf8");
  check(!/notifications\.|changes\.push|fcm|firebase/i.test(src), "no push/notification path in media-watch");

  let pw = null; try { pw = require(process.env.PLAYWRIGHT_PATH || "playwright"); } catch (e) {}
  const chrome = process.env.CHROME || "/usr/bin/google-chrome";
  if (!pw || !fs.existsSync(chrome)) { console.log("(browser check skipped: no playwright/Chrome)"); return done(); }
  const types = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png" };
  const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html";
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream" }); r.end(d); }); });
  await new Promise((ok) => srv.listen(0, ok));
  const b = await pw.chromium.launch({ executablePath: chrome, args: ["--no-sandbox"] });
  try {
    const pg = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
    await pg.goto(`http://localhost:${srv.address().port}/`, { waitUntil: "networkidle" });
    await pg.waitForSelector(".hdr-right", { state: "attached", timeout: 30000 });
    await pg.evaluate(() => document.querySelector(".hdr-right").click()); await pg.waitForTimeout(2000);
    const r = await pg.evaluate(() => {
      const art = document.querySelector('[data-entry="x-2113907865060819060"]'); if (!art) return null;
      art.scrollIntoView({ block: "center" });
      const sp = art.querySelector(".xm-split"); if (!sp) return { art: true };
      const as = [...sp.children].map((a) => a.getBoundingClientRect()), s = sp.getBoundingClientRect(), ar = art.getBoundingClientRect();
      const single = [...document.querySelectorAll(".post .xm-grid.n1")].map((g) => g.getBoundingClientRect());
      return { n: as.length, w: as.map((x) => x.width), h: as.map((x) => x.height), gap: as[1].left - as[0].right, left: s.left, right: s.right, ar: [ar.left, ar.right], sh: s.height, sw: s.width,
        rad: [...sp.children].map((a) => getComputedStyle(a).borderRadius), single: single.slice(0, 3).map((g) => ({ w: g.width, h: g.height })), docW: document.documentElement.scrollWidth,
        splits: document.querySelectorAll(".xm-split").length, maxImgs: Math.max(...[...document.querySelectorAll(".xm-split")].map((x) => x.querySelectorAll("img").length)) };
    });
    check(r && r.n === 2, "390x844: B22 Pad card shows 2 photos");
    if (r && r.n === 2) {
      check(Math.abs(r.w[0] - r.w[1]) <= 1 && r.gap >= 2 && r.gap <= 8, `equal halves (${r.w.map((x) => x.toFixed(1))}) with a small gap (${r.gap.toFixed(1)}px)`);
      check(r.rad.every((x) => x === "12px"), "matching rounded corners (12px)");
      check(r.left >= r.ar[0] - 0.5 && r.right <= r.ar[1] + 0.5 && r.docW <= 390, "no overflow at 390 wide");
      const sg = r.single[0]; check(sg && Math.abs(sg.w - r.sw) <= 1 && r.sh <= sg.h + 1 && r.sh >= sg.h * 0.8, `same height as a single image or slightly shorter (${r.sh.toFixed(1)} vs ${sg && sg.h.toFixed(1)})`);
      check(r.single.every((g) => Math.abs(g.h / g.w - 9 / 16) < 0.02), "single-image cards unchanged (16:9 n1 grid)");
      check(r.maxImgs <= 2, "no split shows more than 2");
      if (process.env.SHOT) { await pg.evaluate(() => { const m = [...document.querySelectorAll("button")].find((x) => /Maybe later/.test(x.textContent)); if (m) m.click(); const d = document.querySelector(".notif-prompt, [role=dialog]"); if (d && !m) d.remove(); document.querySelector('[data-entry="x-2113907865060819060"]').scrollIntoView({ block: "center" }); }); await pg.waitForTimeout(2500); await pg.screenshot({ path: process.env.SHOT }); }
      // tap → lightbox with that photo
      await pg.evaluate(() => document.querySelectorAll('[data-entry="x-2113907865060819060"] .xm-split a')[0].click()); await pg.waitForTimeout(600);
      const lb = await pg.evaluate(() => [...document.querySelectorAll("img")].some((i) => /HVZoSvdakAAst89/.test(i.src) && !i.closest(".xm-split") && i.getBoundingClientRect().width > 300));
      check(lb, "tapping the left photo opens it full size");
    }
  } finally { await b.close(); srv.close(); }
  done();
})().catch((e) => { check(false, "crashed: " + e.message); done(); });
function done() { console.log(`\n${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0); }
