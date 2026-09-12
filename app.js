
/* ─────────────────────────────────────────────────────────────
   DATA — the only part you edit when a new flight happens.
   Everything else (order, days between, countdown) is computed.
   outcome: "success" | "partial" | "failure"
   status (next flight): "confirmed" | "net" | "tbc"

   PHOTOS — optional. Add real SpaceX photos to any flight by adding
   a "photo" field to that flight's object, e.g. for flight 10:
     photo: {
       thumb: "images/f10-thumb.jpg",       // small card image
       gallery: ["images/f10-a.jpg", "images/f10-b.jpg"],  // expanded view, up to 2
     }
   Drop the actual image files into an "images" folder in this repo
   (same one this file lives in). Flights with no "photo" field just
   keep the placeholder — nothing breaks either way.
   ───────────────────────────────────────────────────────────── */

const FLIGHTS = [
  { n: 1, date: "2023-04-20T13:33:09Z", pad: "Pad 1", block: "V1", booster: "B7", ship: "S24", outcome: "failure",
    headline: "The first time the full stack flew",
    photo: { thumb: "images/f1-thumb.jpg", gallery: ["images/f1-a.jpg", "images/f1-b.jpg"] },
    story: "Booster 7 and Ship 24 lifted off together for the first time, but several engines were already out. The rocket began to tumble before the stages could separate, and the flight termination system ended it about four minutes in. The blast also dug a crater under the pad, forcing a rebuild with a water-cooled steel plate." },
  { n: 2, date: "2023-11-18T13:02:50Z", pad: "Pad 1", block: "V1", booster: "B9", ship: "S25", outcome: "failure",
    headline: "Hot staging works",
    photo: { thumb: "images/f2-thumb.jpg", gallery: ["images/f2-a.jpg", "images/f2-b.jpg"] },
    story: "All 33 booster engines ran the full ascent, and the new hot-staging separation, where the ship lights its engines while still attached, worked first time. The booster broke apart during its boostback burn soon after. The ship climbed to the edge of space before it was lost late in its engine burn." },
  { n: 3, date: "2024-03-14T13:25:00Z", pad: "Pad 1", block: "V1", booster: "B10", ship: "S28", outcome: "partial",
    headline: "First trip to space",
    photo: { thumb: "images/f3-thumb.jpg", gallery: ["images/f3-a.jpg", "images/f3-b.jpg"] },
    story: "Ship 28 completed its full engine burn and coasted through space for the first time, testing a propellant transfer and opening its payload door. The planned engine relight was skipped after the ship began to roll. It was lost during re-entry, but not before streaming live views of the glowing plasma around it." },
  { n: 4, date: "2024-06-06T12:50:00Z", pad: "Pad 1", block: "V1", booster: "B11", ship: "S29", outcome: "success",
    headline: "Both stages come home",
    photo: { thumb: "images/f4-thumb.jpg", gallery: ["images/f4-a.jpg", "images/f4-b.jpg"] },
    story: "For the first time both stages made a controlled splashdown: the booster in the Gulf of Mexico, the ship in the Indian Ocean. On the way down one of the ship's flaps visibly burned through on camera, yet it kept steering and landed near its target. It was the dress rehearsal for catching the booster." },
  { n: 5, date: "2024-10-13T12:25:00Z", pad: "Pad 1", block: "V1", booster: "B12", ship: "S30", outcome: "success",
    headline: "The chopsticks catch",
    photo: { thumb: "images/f5-thumb.jpg", gallery: ["images/f5-a.jpg", "images/f5-b.jpg"] },
    story: "Booster 12 flew back to Starbase and was caught mid-air by the launch tower's arms, a world first. Ship 30 then flew a clean re-entry and splashed down on target in the Indian Ocean. It was also the first flight with no engine failures." },
  { n: 6, date: "2024-11-19T22:00:00Z", pad: "Pad 1", block: "V1", booster: "B13", ship: "S31", outcome: "success",
    headline: "A banana goes to space",
    photo: { thumb: "images/f6-thumb.jpg", gallery: ["images/f6-a.jpg", "images/f6-b.jpg"] },
    story: "The catch was called off after tower sensors were damaged at liftoff, so the booster splashed down in the Gulf instead. The ship relit a Raptor engine in space for the first time and made Starship's first daylight splashdown, carrying a plush banana as its zero-g indicator. The last V1 ship." },
  { n: 7, date: "2025-01-16T22:37:00Z", pad: "Pad 1", block: "V2", booster: "B14", ship: "S33", outcome: "failure",
    headline: "New ship, second catch",
    photo: { thumb: "images/f7-thumb.jpg", gallery: ["images/f7-a.jpg", "images/f7-b.jpg"] },
    story: "The first V2 ship debuted with upgraded structure and avionics. Booster 14 came back and was caught by the tower for the second time. Ship 33 was lost minutes into flight when a propellant leak caused engine shutdowns and a fire, with debris seen over the Caribbean." },
  { n: 8, date: "2025-03-06T23:31:02Z", pad: "Pad 1", block: "V2", booster: "B15", ship: "S34", outcome: "failure",
    headline: "A repeat of Flight 7",
    photo: { thumb: "images/f8-thumb.jpg", gallery: ["images/f8-a.jpg", "images/f8-b.jpg"] },
    story: "Booster 15 was caught again, even after two engines failed to relight for its return. Ship 34 lost several engines late in its ascent, began to spin and was lost, again scattering debris over the Caribbean." },
  { n: 9, date: "2025-05-27T23:36:28Z", pad: "Pad 1", block: "V2", booster: "B14-2", ship: "S35", outcome: "partial",
    headline: "The first reflown booster",
    photo: { thumb: "images/f9-thumb.jpg", gallery: ["images/f9-a.jpg", "images/f9-b.jpg"] },
    story: "Booster 14 became the first Super Heavy to fly twice, testing a steep descent before being lost over the Gulf. Ship 35 reached its planned trajectory, but its payload door stayed shut and a leak sent it spinning. It broke up during re-entry over the Indian Ocean." },
  { n: 10, date: "2025-08-26T23:30:00Z", pad: "Pad 1", block: "V2", booster: "B16", ship: "S37", outcome: "success",
    headline: "Back on track",
    photo: { thumb: "images/f10-thumb.jpg", gallery: ["images/f10-a.jpg", "images/f10-b.jpg"] },
    story: "Delayed after the ship first assigned to it was lost in ground testing, Flight 10 ticked off almost every goal. The ship deployed eight Starlink simulators, relit an engine in space and splashed down within metres of its target, despite visible damage around its engine bay." },
  { n: 11, date: "2025-10-13T23:23:00Z", pad: "Pad 1", block: "V2", booster: "B15-2", ship: "S38", outcome: "success",
    headline: "V2 signs off",
    photo: { thumb: "images/f11-thumb.jpg", gallery: ["images/f11-a.jpg", "images/f11-b.jpg"] },
    story: "The last V2 flight and the last from Pad 1 before its rebuild. A reused booster flew almost cleanly, and the ship deployed its simulators, relit in space and handled re-entry with several heat shield tiles removed on purpose, landing on target." },
  { n: 12, date: "2026-05-22T22:30:22Z", pad: "Pad 2", block: "V3", booster: "B19", ship: "S39", outcome: "success",
    headline: "Version 3 arrives",
    photo: { thumb: "images/f12-thumb.jpg", gallery: ["images/f12-a.jpg", "images/f12-b.jpg"] },
    story: "The first V3 Starship and the first launch from Starbase's second pad. The booster lost most of its engines on the boostback relight and hit the Gulf at speed. The ship reached its planned trajectory, released 20 simulators plus two working Starlink satellites that filmed it in space, then made a controlled splashdown." },
  { n: 13, date: "2026-07-24T22:51:00Z", pad: "Pad 2", block: "V3", booster: "B20", ship: "S40", outcome: "success",
    headline: "Real satellites, and a ship that floated",
    photo: { thumb: "images/f13-thumb.jpg", gallery: ["images/f13-a.jpg", "images/f13-b.jpg"] },
    story: "The first flight to release working Starlink V3 satellites, 20 of them, on a path that let them burn up afterwards as planned. The booster lost engines during its landing burn. The ship made its best re-entry yet and survived tipping over after splashdown, so SpaceX could recover it and study the heat shield." },
];

const NEXT_FLIGHT = {
  n: 14,
  status: "net",
  date: "2026-09-15T00:00:00Z",
  pad: "Pad 2", block: "V3", booster: "B21", ship: "S41",
  headline: "First attempt to reach orbit",
  note: "Carrying around 20 working Starlink V3 satellites. The ship is expected to splash down in the Indian Ocean; catching it with the tower is planned for a later flight.",
};

const DATA_CHECKED = "11 Sep 2026";

/* ───────────── helpers ───────────── */

const DAY = 86400000;
const utcDay = (iso) => { const d = new Date(iso); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const daysBetween = (a, b) => Math.round((utcDay(b) - utcDay(a)) / DAY);
const fmt = (iso, opts) => new Date(iso).toLocaleDateString("en-GB", { timeZone: "UTC", ...opts });
const pad2 = (x) => String(x).padStart(2, "0");
const EXPAND_MS = 450; // how long a card takes to open or close
const OUTCOME_LABEL = { success: "Success", partial: "Partial", failure: "Failure" };

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Scroll just enough to show the whole card (extra = height it is about to grow by)
function ensureVisible(el, extra = 0) {
  if (!el) return;
  const margin = 16;
  const r = el.getBoundingClientRect();
  let d = r.bottom + extra + margin - window.innerHeight;
  d = Math.min(d, r.top - margin); // never push the card's top off screen
  if (d > 1) window.scrollBy({ top: d, behavior: reduceMotion() ? "auto" : "smooth" });
}

function useNow(fast) {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), fast ? 1000 : 60000);
    return () => clearInterval(id);
  }, [fast]);
  return now;
}

/* ───────────── pieces ───────────── */

function RocketMark() {
  return (
    <svg viewBox="0 0 24 80" aria-hidden="true">
      <path d="M12 2c4 6 6 13 6 20v48h-12V22c0-7 2-14 6-20z" fill="currentColor" />
      <path d="M6 58l-4 12h4zM18 58l4 12h-4z" fill="currentColor" />
    </svg>
  );
}

function PhotoSlot({ size, src, alt }) {
  if (src) {
    return (
      <div className={`photo photo-${size} has-img`}>
        <img src={src} alt={alt || ""} loading="lazy" />
        <span className="photo-credit">SpaceX</span>
      </div>
    );
  }
  return (
    <div className={`photo photo-${size}`} role="img" aria-label="Photo placeholder">
      <RocketMark />
      {size === "wide" && <span className="photo-cap">Photo to come</span>}
    </div>
  );
}

function Pill({ outcome }) {
  return <span className={`pill pill-${outcome}`}>{OUTCOME_LABEL[outcome]}</span>;
}

function Connector({ label, dashed }) {
  return (
    <div className="gap" aria-hidden="true">
      <span className={`gap-line${dashed ? " dashed" : ""}`} />
      <span className="gap-label">{label}</span>
    </div>
  );
}

function Countdown({ flight }) {
  const now = useNow(flight.status === "confirmed");
  if (flight.status === "tbc") return <div className="cd"><span className="cd-val cd-tbc">Date to be confirmed</span></div>;
  if (flight.status === "net") {
    return (
      <div className="cd" aria-label={`No earlier than ${fmt(flight.date, { day: "numeric", month: "long" })}`}>
        <span className="cd-tag">NET</span>
        <span className="cd-val">{fmt(flight.date, { day: "numeric", month: "short" })}</span>
      </div>
    );
  }
  const diff = Math.max(0, new Date(flight.date).getTime() - now);
  const d = Math.floor(diff / DAY), h = Math.floor(diff / 3600000) % 24, m = Math.floor(diff / 60000) % 60, s = Math.floor(diff / 1000) % 60;
  return (
    <div className="cd">
      <span className="cd-tag">T–</span>
      <span className="cd-val">{diff === 0 ? "Launching" : `${d}d ${pad2(h)}:${pad2(m)}:${pad2(s)}`}</span>
    </div>
  );
}

function NextFlightCard({ f }) {
  const dateText =
    f.status === "tbc" ? "To be confirmed"
    : f.status === "net" ? `No earlier than ${fmt(f.date, { day: "numeric", month: "long", year: "numeric" })}`
    : fmt(f.date, { day: "numeric", month: "long", year: "numeric" });
  return (
    <section className="next" aria-label={`Next flight: Flight ${f.n}`}>
      <div className="next-top">
        <Countdown flight={f} />
        <span className="next-kicker">Next flight</span>
      </div>
      <div className="next-title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n}</span></div>
      <p className="next-head">{f.headline}</p>
      <dl className="facts">
        <dt>Date</dt><dd>{dateText}</dd>
        <dt>Site</dt><dd>Starbase, {f.pad}</dd>
        <dt>Vehicle</dt><dd>{f.block}, Booster {f.booster.replace("B", "")}, Ship {f.ship.replace("S", "")}</dd>
      </dl>
      <p className="next-note">{f.note}</p>
    </section>
  );
}

function FlightCard({ f, open, onTap, register }) {
  const onKey = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(f.n); } };

  return (
    <article ref={(el) => register(f.n, el)} className={`card${open ? " is-open" : ""}`}>
      <div className="card-head" role="button" tabIndex={0} aria-expanded={open} onClick={() => onTap(f.n)} onKeyDown={onKey}>
        <PhotoSlot size="thumb" src={f.photo?.thumb} alt={`Starship Flight ${f.n}`} />
        <div className="info">
          <div className="info-top">
            <div className="title"><span className="t-word">Starship Flight</span><span className="t-num">{f.n}</span></div>
            <Pill outcome={f.outcome} />
          </div>
          <div className="date">{fmt(f.date, { day: "numeric", month: "short", year: "numeric" })}</div>
          <div className="sub">Starbase, {f.pad}</div>
          <div className="sub">{f.block} · {f.booster} / {f.ship}</div>
        </div>
        <svg className="chev" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 5.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="more">
        <div className="more-inner">
          <div className="more-pad">
            <h3 className="headline">{f.headline}</h3>
            <p className="story">{f.story}</p>
            <div className="gallery">
              <PhotoSlot size="wide" src={f.photo?.gallery?.[0]} alt={`${f.headline} \u2014 photo 1`} />
              <PhotoSlot size="wide" src={f.photo?.gallery?.[1]} alt={`${f.headline} \u2014 photo 2`} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function AboutPanel({ open, onClose }) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open]);

  return (
    <>
      <div className={`scrim${open ? " show" : ""}`} onClick={onClose} />
      <aside className={`about${open ? " show" : ""}`} aria-label="About">
        <button className="round-btn" onClick={onClose} aria-label="Close about">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        <h2>About</h2>
        <p>A personal log of every Starship flight. No ads, no tracking.</p>
        <dl>
          <dt>Photos</dt><dd>All photos by SpaceX, credited on each image.</dd>
          <dt>Flight data</dt><dd>SpaceX flight updates and Wikipedia's list of Starship launches. Last checked {DATA_CHECKED}.</dd>
          <dt>Next flight</dt><dd>Launch dates move often. NET means no earlier than that date. A live countdown appears once SpaceX confirms the time.</dd>
        </dl>
        <p className="about-foot">Version 1.3</p>
      </aside>
    </>
  );
}

/* ───────────── app ───────────── */

function StarshipTracker() {
  const [openId, setOpenId] = React.useState(null);
  const [aboutOpen, setAboutOpen] = React.useState(false);
  const cardEls = React.useRef({});
  const pending = React.useRef(null);
  const now = useNow(false);

  const flights = [...FLIGHTS].sort((a, b) => b.n - a.n);
  const latest = flights[0];
  const daysSinceLatest = Math.round((Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate()) - utcDay(latest.date)) / DAY);

  const register = (n, el) => { if (el) cardEls.current[n] = el; };

  const handleTap = (n) => {
    if (openId === n) { // tap the open card: it simply closes in place
      pending.current = { open: null, close: n };
      setOpenId(null);
      return;
    }
    const r = cardEls.current[n].getBoundingClientRect();
    const prev = openId != null ? cardEls.current[openId] : null;
    const pr = prev && prev.getBoundingClientRect();
    pending.current = {
      open: n, close: openId,
      startTop: r.top, startY: window.scrollY,
      oldAbove: !!pr && pr.top < r.top,                            // is the closing card above the tapped one?
      oldVisible: !!pr && pr.bottom > 0 && pr.top < window.innerHeight, // can you see it?
    };
    setOpenId(n);
  };

  // Plan the whole move up front, then do it in ONE straight line:
  // 1. Work out where the tapped card should end up:
  //    - old card visible above it: let it slide up naturally as the old one closes
  //    - old card off-screen: keep it exactly where your finger was
  //    - then nudge it up only if the opened card would run off the bottom
  // 2. Animate heights and scroll together, frame by frame, with the same easing.
  //    Nothing overshoots or reverses, so no flashing.
  // Touching or scrolling mid-animation hands scroll control straight back to you.
  React.useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const openEl = p.open != null ? cardEls.current[p.open] : null;
    const closeEl = p.close != null ? cardEls.current[p.close] : null;
    const openMore = openEl && openEl.querySelector(".more");
    const closeMore = closeEl && closeEl.querySelector(".more");
    const ms = reduceMotion() ? 0 : EXPAND_MS;
    const ease = (t) => 1 - Math.pow(1 - t, 3);

    const setHeights = (e) => {
      if (openMore) openMore.style.gridTemplateRows = `${e}fr`;
      if (closeMore) closeMore.style.gridTemplateRows = `${1 - e}fr`;
    };
    setHeights(0); // starting state, applied before the screen paints

    // 1. plan the destination
    let targetY = null;
    if (openEl && p.startTop != null) {
      const vh = window.innerHeight, m = 16;
      const oldShrink = p.oldAbove && closeEl ? closeEl.querySelector(".more-inner").offsetHeight : 0;
      const finalH = openEl.offsetHeight + openEl.querySelector(".more-inner").scrollHeight;
      const base = p.oldVisible ? p.startTop - oldShrink : p.startTop;
      let finalTop = Math.min(base, vh - m - finalH);       // fit the whole card on screen
      finalTop = Math.max(finalTop, Math.min(base, m));      // but never push its top off screen
      targetY = (p.startTop + p.startY - oldShrink) - finalTop;
      if (Math.abs(targetY - p.startY) < 1) targetY = null;  // no scroll needed
    }

    let userTookOver = false, raf = 0;
    const takeOver = () => { userTookOver = true; };
    window.addEventListener("touchstart", takeOver, { passive: true, once: true });
    window.addEventListener("wheel", takeOver, { passive: true, once: true });

    // 2. move there in one line
    const frame = (e) => {
      setHeights(e);
      if (targetY != null && !userTookOver) window.scrollTo(0, p.startY + (targetY - p.startY) * e);
    };
    const finish = () => {
      if (openMore) openMore.style.gridTemplateRows = "";
      if (closeMore) closeMore.style.gridTemplateRows = "";
    };

    if (ms === 0) { frame(1); finish(); }
    else {
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        frame(ease(t));
        if (t < 1) raf = requestAnimationFrame(tick); else finish();
      };
      raf = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(raf);
      finish();
      window.removeEventListener("touchstart", takeOver);
      window.removeEventListener("wheel", takeOver);
    };
  }, [openId]);

  return (
    <div className="st">
      <style>{css}</style>
      <div className="st-wrap">
        <header className="top">
          <button className="round-btn" onClick={() => setAboutOpen(true)} aria-label="Open about">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6h10M3 10h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
          <div className="brand">Starship<span>Flight log</span></div>
          <span />
        </header>

        <NextFlightCard f={NEXT_FLIGHT} />
        <Connector dashed label={`${daysSinceLatest} days since the last flight`} />

        {flights.map((f, i) => (
          <div key={f.n}>
            <FlightCard f={f} open={openId === f.n} onTap={handleTap} register={register} />
            {i < flights.length - 1 && <Connector label={`${daysBetween(flights[i + 1].date, f.date)} days`} />}
          </div>
        ))}

        <p className="end">That's every flight so far.</p>
      </div>
      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}

/* ───────────── styles ───────────── */

const css = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600;700&display=swap');

.st {
  --bg: #1A2236; --card: #222D46; --card-open: #27344F; --line: #3B4A6B;
  --text: #E4EAF6; --muted: #97A3BD; --faint: #66738F; --red: #EE6B6E;
  min-height: 100vh; color: var(--text);
  background: radial-gradient(130% 55% at 50% -8%, #2E3D63 0%, #1A2236 62%), #1A2236;
  font-family: Manrope, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.st *, .st *::before, .st *::after { box-sizing: border-box; }
html, body, .st { overflow-anchor: none; } /* we handle scroll position ourselves */
.title { flex-wrap: wrap; row-gap: 2px; }
.t-word { white-space: nowrap; }
.st-wrap { max-width: 440px; margin: 0 auto; padding: 18px 18px 72px; }

/* header */
.top { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; margin-bottom: 22px; }
.round-btn {
  width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; cursor: pointer;
  border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); color: var(--muted);
}
.round-btn:focus-visible, .card-head:focus-visible { outline: 2px solid #A9BDF0; outline-offset: 3px; }
.brand { text-align: center; font-weight: 600; font-size: 15px; }
.brand span { display: block; font-weight: 400; font-size: 12px; color: var(--faint); margin-top: 1px; }

/* next flight */
.next {
  border-radius: 24px; padding: 18px 18px 20px;
  background: linear-gradient(160deg, #3B4878 0%, #2B3558 100%);
  border: 1px solid rgba(170,190,245,.25);
  box-shadow: 0 24px 48px -28px rgba(8,12,28,.9);
}
.next-top { display: flex; justify-content: space-between; align-items: center; }
.next-kicker { font-size: 12px; color: #C3CDEA; }
.cd { display: inline-flex; border-radius: 10px; overflow: hidden; font-size: 13px; font-weight: 600; }
.cd-tag { background: var(--red); color: #fff; padding: 6px 9px; }
.cd-val { background: #F4F6FB; color: #1D2540; padding: 6px 10px; font-variant-numeric: tabular-nums; }
.cd-tbc { background: rgba(255,255,255,.1); color: #fff; }
.next-title { display: flex; align-items: baseline; gap: 8px; margin: 22px 0 0; }
.next-title .t-word { font-size: 18px; font-weight: 500; color: #D3DBF0; }
.next-title .t-num { font-size: 40px; font-weight: 400; line-height: .9; letter-spacing: -.015em; }
.next-head { font-size: 17px; font-weight: 600; margin: 12px 0 14px; }
.facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 16px; font-size: 13.5px; margin: 0 0 14px; }
.facts dt { color: #AAB6D6; }
.facts dd { margin: 0; }
.next-note { font-size: 13.5px; line-height: 1.55; color: #CDD6EE; margin: 0; }

/* connector between cards */
.gap { position: relative; height: 46px; }
.gap-line { position: absolute; left: 54px; top: 0; bottom: 0; width: 1px; background: var(--line); }
.gap-line.dashed { background: none; border-left: 1px dashed #5A6A9A; }
.gap-label { position: absolute; left: 68px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--faint); font-variant-numeric: tabular-nums; }

/* flight card */
.card { background: var(--card); border-radius: 18px; transition: background-color .3s; }
.card.is-open { background: var(--card-open); }
.card-head { -webkit-tap-highlight-color: transparent; touch-action: manipulation; position: relative; display: grid; grid-template-columns: 84px 1fr; gap: 14px; padding: 12px; cursor: pointer; border-radius: 18px; }
.photo {
  position: relative; overflow: hidden; border-radius: 12px; display: grid; place-items: center;
  background: linear-gradient(165deg, #34466E 0%, #1C263D 100%); color: #8EA3D4;
}
.photo svg { height: 62%; width: auto; opacity: .28; }
.photo-thumb { width: 84px; height: 104px; }
.photo-wide { aspect-ratio: 4 / 3; }
.photo-wide svg { height: 48%; }
.photo-cap { position: absolute; left: 9px; bottom: 7px; font-size: 10.5px; color: rgba(220,228,245,.55); }
.photo.has-img img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  filter: saturate(88%) contrast(104%) brightness(92%);
}
.photo.has-img::after {
  content: ""; position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(26,34,54,0) 55%, rgba(26,34,54,.85) 100%),
    linear-gradient(200deg, rgba(59,72,120,.35) 0%, rgba(26,34,54,0) 55%);
}
.photo-credit { position: absolute; right: 8px; bottom: 6px; font-size: 9.5px; letter-spacing: .02em; color: rgba(228,234,246,.65); z-index: 1; }
.photo-thumb .photo-credit { display: none; } /* keep the small thumbnail clean; credit shows on the bigger gallery images */
.info { min-width: 0; padding-top: 2px; }
.info-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.title { display: flex; align-items: baseline; gap: 6px; }
.title .t-word { font-size: 15px; font-weight: 500; color: #B4BFD6; }
.title .t-num { font-size: 24px; font-weight: 400; line-height: 1; letter-spacing: -.01em; }
.date { font-size: 14px; font-weight: 500; margin-top: 8px; }
.sub { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.pill { font-size: 11.5px; font-weight: 600; padding: 4px 9px; border-radius: 999px; white-space: nowrap; }
.pill-success { background: rgba(124,200,158,.14); color: #9EDBB8; }
.pill-partial { background: rgba(230,200,115,.15); color: #EBD38C; }
.pill-failure { background: rgba(238,120,120,.15); color: #F2A2A2; }
.chev { position: absolute; right: 14px; bottom: 14px; color: var(--faint); transition: transform .35s; }
.card.is-open .chev { transform: rotate(180deg); }

/* expand in place */
.more { display: grid; grid-template-rows: 0fr; } /* animated in JS, see useLayoutEffect */
.card.is-open .more { grid-template-rows: 1fr; }
.more-inner { overflow: hidden; }
.more-pad { padding: 2px 16px 16px; opacity: 0; transition: opacity .25s; }
.card.is-open .more-pad { opacity: 1; transition: opacity .35s .12s; }
.headline { font-size: 16px; font-weight: 600; margin: 6px 0 8px; }
.story { font-size: 14px; line-height: 1.62; color: #C9D2E6; margin: 0 0 14px; }
.gallery { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.end { text-align: center; color: var(--faint); font-size: 12px; margin-top: 28px; }

/* about panel */
.scrim { position: fixed; inset: 0; z-index: 20; background: rgba(8,12,24,.55); opacity: 0; pointer-events: none; transition: opacity .3s; }
.scrim.show { opacity: 1; pointer-events: auto; }
.about {
  position: fixed; top: 0; bottom: 0; left: 0; z-index: 21; width: min(84vw, 340px); overflow-y: auto;
  padding: 18px 22px 28px; background: #202A42; border-right: 1px solid rgba(255,255,255,.06);
  transform: translateX(-102%); visibility: hidden;
  transition: transform .4s cubic-bezier(.2,.75,.2,1), visibility 0s .4s;
}
.about.show { transform: none; visibility: visible; transition: transform .4s cubic-bezier(.2,.75,.2,1); }
.about h2 { font-size: 20px; font-weight: 600; margin: 26px 0 8px; }
.about p { font-size: 14px; line-height: 1.6; color: #C9D2E6; margin: 0; }
.about dl { margin: 8px 0 0; }
.about dt { font-size: 12.5px; color: var(--faint); margin-top: 18px; }
.about dd { margin: 4px 0 0; font-size: 14px; line-height: 1.55; }
.about .about-foot { margin-top: 32px; font-size: 12px; color: var(--faint); }

@media (prefers-reduced-motion: reduce) {
  .st *, .st *::before, .st *::after { transition: none !important; }
}
`;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<StarshipTracker />);
