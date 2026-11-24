#!/usr/bin/env python3
"""Header page-switch render-check (headless Chrome, 390x844, iPhone UA, touch).
Not part of run-tests.js (the runner is node-only and offline; this needs a browser).
Usage: python3 scripts/render-check-header.py [site_root_or_URL] [shot_prefix]
For each switch (tap Road pill; tap Flight Log pill; tap Road; tap back button) it samples the
header every animation frame for 1.6s, saves start/mid/end shots, and asserts:
  order    Flight Log title left of Road title in every frame
  centre   title group centre within +-2px of the initial centre in every frame
  button   menu/back button present, opacity 1, on top at its centre (no title over it), an icon visible
Exit 1 on any failure."""
import sys, os, threading, json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[2] if len(sys.argv) > 2 else None
if SRC.startswith("http"): URL = SRC
else:
    class H(SimpleHTTPRequestHandler):
        def __init__(s, *a, **k): super().__init__(*a, directory=SRC, **k)
        def log_message(s, *a): pass
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=httpd.serve_forever, daemon=True).start()
    URL = f"http://127.0.0.1:{httpd.server_address[1]}/index.html"
DISMISS = "() => { const q=document.querySelector('.notify-btn-quiet'); if(q) q.click(); const st=document.createElement('style'); st.textContent='.notify-modal{display:none!important}'; document.head.appendChild(st); }"
SAMPLER = """(ms) => new Promise(res => { const out=[]; const t0=performance.now();
  const snap=()=>{ const q=(s)=>document.querySelector(s);
    const r=(e)=>{ if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.left, r:b.right, cy:(b.top+b.bottom)/2, op:+getComputedStyle(e).opacity}; };
    const L=q('.hdr-left'), lb=L&&L.getBoundingClientRect(); const hit=lb? document.elementFromPoint(lb.left+lb.width/2, lb.top+lb.height/2):null;
    const ic=[...document.querySelectorAll('.hdr-ic')].map(e=>+getComputedStyle(e).opacity);
    out.push({t:Math.round(performance.now()-t0), a:r(q('.hdr-a')), b:r(q('.hdr-b')), left:r(L), hdrOp:+getComputedStyle(q('.hdr')).opacity,
      leftOnTop: !!(hit && L && L.contains(hit)), icon: Math.max(0, ...ic), feed: document.querySelector('.st').classList.contains('feed-open')});
    if (performance.now()-t0 < ms) requestAnimationFrame(snap); else res(out); }; snap(); })"""
STEPS = (("toRoad-pill", ".hdr-b", True), ("toLog-pill", ".hdr-a", False), ("toRoad-pill2", ".hdr-b", True), ("toLog-back", ".hdr-left", False))
fails = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = br.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")
    pg = ctx.new_page(); pg.goto(URL, wait_until="domcontentloaded", timeout=60000); pg.wait_for_timeout(3000); pg.evaluate(DISMISS); pg.wait_for_timeout(800)
    hdr = pg.locator(".hdr").first
    first = pg.evaluate(SAMPLER, 1)[0]; C0 = (first["a"]["x"] + first["b"]["r"]) / 2
    if OUT: hdr.screenshot(path=f"{OUT}-start.png")
    for name, sel, want in STEPS:
        pg.evaluate("(src)=>{ window.__samp = (eval(src))(1600); }", SAMPLER)
        pg.wait_for_timeout(30); pg.locator(sel).first.tap()
        for i, ms in enumerate((60, 140, 300)):
            pg.wait_for_timeout(ms - (0 if i == 0 else (60, 140, 300)[i - 1]))
            if OUT: hdr.screenshot(path=f"{OUT}-{name}-mid{i+1}.png")
        fr = pg.evaluate("() => window.__samp"); pg.wait_for_timeout(200)
        if OUT: hdr.screenshot(path=f"{OUT}-{name}-end.png")
        bad = []
        for f in fr:
            a, b, l = f["a"], f["b"], f["left"]
            if not (a and b and l): bad.append((f["t"], "missing element")); continue
            if not (a["x"] < b["x"] and a["r"] <= b["x"] + 1): bad.append((f["t"], f"order A[{a['x']:.0f},{a['r']:.0f}] B[{b['x']:.0f},{b['r']:.0f}]"))
            c = (a["x"] + b["r"]) / 2
            if abs(c - C0) > 2: bad.append((f["t"], f"centre {c:.1f} vs {C0:.1f}"))
            if f["hdrOp"] < 1 or l["op"] < 1 or not f["leftOnTop"] or f["icon"] < 0.4: bad.append((f["t"], f"button hdrOp={f['hdrOp']} op={l['op']} onTop={f['leftOnTop']} icon={f['icon']:.2f}"))
        if fr[-1]["feed"] != want: bad.append((fr[-1]["t"], f"page did not switch (feed-open={fr[-1]['feed']})"))
        print(("ok  " if not bad else "FAIL") + f" {name}: {len(fr)} frames" + ("" if not bad else f", {len(bad)} bad; first: {bad[0]}"))
        if bad: fails.append(name)
    br.close()
print("header render-check:", "PASS" if not fails else "FAIL " + ",".join(fails), f"(centre {C0:.1f}px of 390)")
sys.exit(1 if fails else 0)
