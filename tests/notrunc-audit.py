#!/usr/bin/env python3
# Rendered-text audit used by tests/test-notrunc.js: at 320/360/390 (phone) and 320 with a desktop scrollbar, no vehicle
# name, box name, summary, chip or date on Page 1 (current + past Road boxes) or Page 2 (every group open) is cut off,
# ellipsized or clipped. Prints JSON. Local only: serves the repo on 127.0.0.1, sends nothing.
import json, os, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def log_message(s, *a): pass
httpd = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=httpd.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
DISMISS = "() => { const q=document.querySelector('.notify-btn-quiet'); if(q) q.click(); document.querySelectorAll('.scrim,.notify-modal').forEach(e=>e.remove()); }"
# the opened flight card's gallery: which photos, loaded, fit, label, slot vs image aspect ratio
PHOTOS = """(card) => [...card.querySelectorAll('.gallery')].map(g => ({ flight: card.querySelector('.t-num').textContent.trim(), vehicles: g.hasAttribute('data-vehicles'),
  pics: [...g.querySelectorAll('.photo')].map(ph => { const i = ph.querySelector('img'), b = ph.getBoundingClientRect(); return { src: i && i.getAttribute('src'), ok: !!(i && i.complete && i.naturalWidth > 0), fit: i && getComputedStyle(i).objectFit,
    label: (ph.querySelector('.photo-credit') || {}).textContent || null, boxAR: Math.round(b.width / b.height * 1000) / 1000, imgAR: i && i.naturalHeight ? Math.round(i.naturalWidth / i.naturalHeight * 1000) / 1000 : null }; }) }))"""
AUDIT = """(sels) => { const out = [];
  for (const [kind, sel] of sels) for (const el of document.querySelectorAll(sel)) { if (!el.offsetParent) continue;
    const r = document.createRange(); r.selectNodeContents(el); const tw = r.getBoundingClientRect().width, bw = el.getBoundingClientRect().width, cs = getComputedStyle(el);
    const clamp = (parseInt(cs.webkitLineClamp || '0') || 0) > 0 && el.scrollHeight > el.clientHeight + 1;
    const over = tw > bw + 0.5 || el.scrollWidth > el.clientWidth + 0.5 || clamp, ell = cs.textOverflow === 'ellipsis' && over;
    let clip = false, p = el.parentElement; const er = el.getBoundingClientRect();
    while (p && p !== document.body) { const ps = getComputedStyle(p); if (/hidden|clip/.test(ps.overflowX)) { const pr = p.getBoundingClientRect(); if (pr.width > 0 && (er.right > pr.right + 0.5 || er.left < pr.left - 0.5)) { clip = true; break; } }
      if (/past-box|post|callout|mini|rfs/.test(p.className || '')) break; p = p.parentElement; }
    if (over || ell || clip) out.push({ kind, text: el.textContent.trim().slice(0, 60), tw: Math.round(tw), bw: Math.round(bw), ell, clip }); } return out; }"""
P1 = [["vehicle", ".past-veh"], ["vehicle", "section.road .flog-name"], ["summary", ".past-text"], ["pill", ".past-pill"], ["date", "section.road .mini-date"], ["summary", "section.road .callout-latest"], ["box name", "section.road .callout-name"]]
P2 = [["chip", ".post-top .chip"], ["date", ".post-date"], ["summary", ".post-text"], ["date", ".bu-date"]]
res = []
with sync_playwright() as p:
    for W, mobile in [(320, True), (360, True), (390, True), (320, False)]:
        br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox", "--disable-dev-shm-usage"], ignore_default_args=[] if mobile else ["--hide-scrollbars"])
        ctx = br.new_context(viewport={"width": W, "height": 844}, is_mobile=mobile, has_touch=mobile)
        pg = ctx.new_page(); pg.add_init_script("localStorage.setItem('st_notif_status','off');")
        pg.goto(URL, wait_until="domcontentloaded"); pg.wait_for_selector("section.road", timeout=60000); pg.wait_for_timeout(2500); pg.evaluate(DISMISS)
        bad = []
        pg.locator("section.road .road-head").click(); pg.wait_for_timeout(500)
        for b in pg.evaluate("() => [...document.querySelectorAll('section.road .callout')].map(c => c.dataset.id)"):
            hd = pg.locator(f"section.road .callout[data-id='{b}'] button.callout-head")
            if hd.count() and pg.evaluate("(b) => !document.querySelector(`section.road .callout[data-id='${b}']`).classList.contains('open')", b): hd.click(); pg.wait_for_timeout(350)
            bad += pg.evaluate(AUDIT, P1)
        photos = []
        for n in pg.evaluate("() => [...document.querySelectorAll('article.card')].filter(c => c.querySelector('.past-toggle')).map(c => c.querySelector('.t-num').textContent.trim())"):
            c = pg.locator("article.card").filter(has=pg.locator(".t-num", has_text=n)).first
            c.scroll_into_view_if_needed()
            if "is-open" not in (c.get_attribute("class") or ""): c.locator(".card-head").click(); pg.wait_for_timeout(600)
            tg = c.locator(".past-toggle")
            if tg.first.get_attribute("aria-expanded") != "true": tg.first.click(); pg.wait_for_timeout(900)
            bad += pg.evaluate(AUDIT, P1)
            pg.wait_for_timeout(600)
            photos += c.evaluate(PHOTOS)
        pg.goto(URL + "?feed=1", wait_until="domcontentloaded"); pg.wait_for_selector(".feed-list", timeout=60000); pg.wait_for_timeout(2500); pg.evaluate(DISMISS)
        for gid in pg.evaluate("() => [...document.querySelectorAll('.feed-list .rfs')].map(s => s.id)"):
            if not pg.evaluate("(id) => document.getElementById(id).classList.contains('is-open')", gid): pg.locator(f"#{gid} .feed-pill").first.click(); pg.wait_for_timeout(500)
            m = pg.locator(f"#{gid} .rfs-more")
            if m.count() and m.first.get_attribute("aria-expanded") != "true": m.first.click(); pg.wait_for_timeout(300)
        pg.evaluate("() => document.querySelectorAll('.feed-list details').forEach(d => d.open = true)"); pg.wait_for_timeout(400)
        bad += pg.evaluate(AUDIT, P2)
        page2 = pg.evaluate("""() => ({ groups: [...document.querySelectorAll('.feed-list .rfs')].map(s => ({ flight: Number(s.dataset.flight), open: s.classList.contains('is-open'), cards: s.querySelectorAll('.rfs-feed > article.post, .rfs-feed > * article.post').length,
            shown: [...s.querySelectorAll('article.post')].filter(a => a.offsetParent && a.getBoundingClientRect().height > 0).length })), showButtons: [...document.querySelectorAll('button')].filter(b => /show (all|fewer|more) updates/i.test(b.textContent)).length,
            rfsMore: document.querySelectorAll('.rfs-more, .rfs-extra').length })""")
        seen, uniq = set(), []
        for x in bad:
            k = (x["kind"], x["text"])
            if k not in seen: seen.add(k); uniq.append(x)
        res.append({"w": W, "desktop": not mobile, "bad": uniq, "photos": photos, "page2": page2})
        br.close()
print(json.dumps(res))
