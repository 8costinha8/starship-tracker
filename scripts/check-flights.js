/* ─────────────────────────────────────────────────────────────
   Runs on a schedule (see .github/workflows/flight-checker.yml).
   Checks the real Starship flight data, compares it to what it
   saw last time, and — only if something actually changed —
   sends the right notification to everyone subscribed.

   It also watches for a flight's FINAL result (Success / Failure /
   Partial Failure). The first time that shows up for a flight, it:
     1. Asks Claude to write that flight's story (using the two most
        recent flights in app.js as a style reference)
     2. Adds the new flight into app.js's FLIGHTS list itself
     3. Commits and pushes that change straight to the repo
   Photos are picked up by filename; the highlights field is added
   empty (the card shows "Highlights coming soon") — Bernardo pastes
   the video link in by hand later. When the live feed's next flight moves
   on to a new number, the tracked flight is switched silently (no push):
   check-road.js sends "🚀 Road to Flight N" at 09:00 the next morning.

   Liftoff: when LL2 says "In Flight" (or "Deployed"), it sends
   "🚀 Liftoff!" once per flight. Date/status pushes are only ever about
   the same flight, and never show raw status codes.

   Offline test: node scripts/test-flights.js

   First-ever run: there's no "last time" yet, so it just saves
   today's data as the starting point. No notification fires on
   that first run, on purpose — otherwise everyone would get a
   push the moment this goes live, even though nothing changed.
   ───────────────────────────────────────────────────────────── */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LL2_ENDPOINT = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=1&mode=list";
const APP_JS_PATH = path.join(__dirname, "..", "app.js");
const ANTHROPIC_MODEL = "claude-sonnet-5";

function mapLL2Status(abbrev) {
  if (abbrev === "Go") return "confirmed";
  if (abbrev === "TBC") return "net";
  if (abbrev === "Hold") return "confirmed"; // a hold keeps the countdown's date (same as app.js)
  if (abbrev === "In Flight" || abbrev === "Deployed") return "inflight"; // liftoff happened, mission under way
  if (abbrev === "Success" || abbrev === "Failure" || abbrev === "Partial Failure") return "done";
  return "tbc";
}
// Words for the generic "Flight update" push: never a raw code.
const STATUS_WORDS = { confirmed: "Go for launch", net: "Estimated date only", tbc: "Date to be confirmed" };

// Only true once LL2 has an official final result — usually a few hours
// after liftoff, not instantly.
function mapOutcome(abbrev) {
  if (abbrev === "Success") return "success";
  if (abbrev === "Failure") return "failure";
  if (abbrev === "Partial Failure") return "partial";
  return null;
}

const OUTCOME_LABEL = { success: "Success", partial: "Partial", failure: "Failure" };

// e.g. "28 Sep 13:15" — in London time, auto-adjusting for BST/GMT
function fmtDateTime(iso) {
  const d = new Date(iso);
  const day = Number(d.toLocaleString("en-GB", { day: "numeric", timeZone: "Europe/London" }));
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "Europe/London" });
  const time = d.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/London" });
  return `${day} ${month} ${time}`;
}

// LL2 only counts a time as real when its precision is second, minute or hour.
// Anything rougher (day, week, month, quarter, year...) is still an estimate.
function isExactTime(precision) {
  return precision === "SEC" || precision === "MIN" || precision === "HR";
}

// e.g. "19 Oct" for a day estimate, "Oct 2026" for a month/quarter/year one
function fmtEstimate(iso, precision) {
  if (isExactTime(precision)) return fmtDateTime(iso);
  const d = new Date(iso);
  if (!precision || precision === "DAY" || precision === "AM" || precision === "PM" || precision === "WK") {
    const day = Number(d.toLocaleString("en-GB", { day: "numeric", timeZone: "UTC" }));
    const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
    return `${day} ${month}`;
  }
  let m = d.getUTCMonth();
  if (/^Q[1-4]$/.test(precision || "")) m = (Number(precision[1]) - 1) * 3;
  else if (precision === "H1" || precision === "Y") m = 0;
  else if (precision === "H2") m = 6;
  return new Date(Date.UTC(d.getUTCFullYear(), m, 1)).toLocaleString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

// Pulls the last N `story:` blocks out of app.js as-is, just to give
// Claude a feel for the voice — not a full parse, doesn't need to be.
function recentStories(appJsText, count) {
  // only look inside the FLIGHTS list, and accept "…", '…' or `…`
  const start = appJsText.indexOf("const FLIGHTS = [");
  const end = appJsText.indexOf("\n];", start);
  const block = start >= 0 && end > start ? appJsText.slice(start, end) : appJsText;
  const re = /\bstory:\s*(["'`])((?:(?!\1)[^\\]|\\.)*)\1/g;
  const out = [...block.matchAll(re)].slice(-count).map((m) => m[2]);
  if (!out.length) console.warn("⚠️ No story: fields found in app.js FLIGHTS — the story writer gets no style examples.");
  return out;
}

// Writes Flight N's headline + story using Claude, in the same voice
// as the existing flights.
async function writeStory({ n, outcome, date, pad, block, booster, ship, missionDescription, styleExamples }) {
  const prompt = `Write a short recap for a real SpaceX Starship test flight, for a personal tracking app.

Facts:
- Flight number: ${n}
- Outcome: ${OUTCOME_LABEL[outcome]}
- Date: ${date}
- Pad: ${pad}
- Vehicle: ${block}, Booster ${booster}, Ship ${ship}
- Pre-launch mission plan (written BEFORE the flight): ${missionDescription || "(none available)"}

IMPORTANT: the mission plan above describes what SpaceX INTENDED to do, not what actually happened. Flights are often cut short or changed mid-mission. Do NOT state any planned detail (number of orbits, flight duration, splashdown location, etc.) as if it happened. Only state as fact the outcome and vehicle details listed above. If you are unsure whether something happened, leave it out and keep the recap short and general.

Wording rule: satellites and other payloads are always "deployed" (e.g. "deployed all 26 Starlink V3 satellites"), never "released".

Match this exact voice — plain, factual, past tense, 2–4 sentences, no hype or marketing language, no emoji. Here are the two most recent entries as a style reference:
${styleExamples.map((s, i) => `Example ${i + 1}: ${s}`).join("\n")}

Reply with ONLY valid JSON, nothing else, in this exact shape:
{"headline": "a short 4-8 word caption, no period", "story": "the 2-4 sentence recap"}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`Anthropic API error (${json.error.type}): ${json.error.message}`);
  }
  const text = json.content?.find((b) => b.type === "text")?.text;
  if (!text) {
    throw new Error(`Anthropic API returned no text. Raw response: ${JSON.stringify(json)}`);
  }
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude's reply wasn't valid JSON. Raw text: ${cleaned}`);
  }
}

// Inserts the new flight object right before FLIGHTS's closing "];",
// and bumps the "last checked" date at the top of the file.
function addFlightToAppJs(appJsText, flight) {
  const entry =
    `  { n: ${flight.n}, date: "${flight.date}", pad: "${flight.pad}", block: "${flight.block}", ` +
    `booster: "${flight.booster}", ship: "${flight.ship}", outcome: "${flight.outcome}",\n` +
    `    headline: "${flight.headline.replace(/"/g, '\\"')}",\n` +
    `    highlights: "",\n` +
    `    story: "${flight.story.replace(/"/g, '\\"')}" },\n`;

  const startIdx = appJsText.indexOf("const FLIGHTS = [");
  const closeIdx = appJsText.indexOf("\n];", startIdx);
  let updated = appJsText.slice(0, closeIdx) + "\n" + entry.trimEnd() + appJsText.slice(closeIdx);

  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  updated = updated.replace(/const DATA_CHECKED = "[^"]*";/, `const DATA_CHECKED = "${today}";`);
  return updated;
}

function commitAndPush(flightN, label) {
  execSync(`git config user.name "Starship Tracker Bot"`);
  execSync(`git config user.email "actions@github.com"`);
  execSync(`git add app.js`);
  execSync(`git commit -m "Auto: log Flight ${flightN} (${label})"`);
  execSync(`git push`);
}


// Fetch with a 20s timeout and up to 3 tries, so one slow or
// rate-limited reply from the free launch API doesn't fail the run.
async function fetchJson(url) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      lastErr = err;
      console.log(`Try ${i} failed for ${url}: ${err.message}`);
      if (i < 3) await new Promise((ok) => setTimeout(ok, 5000 * i));
    }
  }
  throw lastErr;
}

async function main() {
  // Dry run: proves the API key works and shows what the story would look
  // like, WITHOUT touching app.js, git, Firebase, or sending any notification.
  if (process.env.TEST_MODE === "true") {
    console.log("=== TEST MODE — nothing will be saved, committed, or sent ===");
    const testFacts = {
      n: 9999, outcome: "success", date: new Date().toISOString(),
      pad: "Pad 2", block: "V3", booster: "B99", ship: "S99",
      missionDescription: "Test mission, used only to check the story-writer end to end.",
    };
    const appJsText = fs.readFileSync(APP_JS_PATH, "utf8");
    const styleExamples = recentStories(appJsText, 2);
    console.log(`Style reference pulled from app.js: ${styleExamples.length} example(s)`);
    styleExamples.forEach((st, i) => console.log(`  ${i + 1}. ${st.slice(0, 120)}…`));

    const { headline, story } = await writeStory({ ...testFacts, styleExamples });
    console.log("\nGenerated headline:", headline);
    console.log("Generated story:", story);

    const updated = addFlightToAppJs(appJsText, { ...testFacts, headline, story });
    const ok = updated.length > appJsText.length && updated.includes("n: 9999");
    console.log(ok
      ? "\n✅ Insertion into app.js text worked correctly. (Dry run only — nothing was saved.)"
      : "\n❌ Insertion FAILED — the text-matching didn't find the right spot. Flag this before relying on the real run.");
    return;
  }

  await run(liveDeps());
}

// Real Firebase + git. firebase-admin is only loaded here, so the offline test needs no install.
function liveDeps() {
  const admin = require("firebase-admin");
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const stateRef = db.collection("app-state").doc("next-flight");
  return {
    fetchJson,
    async loadState() { const snap = await stateRef.get(); return snap.exists ? snap.data() : null; },
    async saveState(st) { await stateRef.set(st); },
    readAppJs: () => fs.readFileSync(APP_JS_PATH, "utf8"),
    writeAppJs: (text) => fs.writeFileSync(APP_JS_PATH, text),
    commitAndPush,
    writeStory,
    // data-only message, so our own service worker decides exactly what to show
    // (one banner, our exact wording, tap opens the app)
    async push(notification) {
      const subs = await db.collection("subscribers").get();
      const tokens = subs.docs.map((d) => d.id);
      if (!tokens.length) { console.log(`Would have sent "${notification.title}" — but there are no subscribers yet.`); return; }
      const resp = await admin.messaging().sendEachForMulticast({ tokens, notification: { title: notification.title, body: notification.body } });
      console.log(`Sent "${notification.title}" to ${resp.successCount}/${tokens.length} device(s).`);
      // quietly remove any tokens that failed (phone uninstalled the app, etc.)
      resp.responses.forEach((r, i) => { if (!r.success) db.collection("subscribers").doc(tokens[i]).delete().catch(() => {}); });
    },
  };
}

// One check: compare LL2 with last time, maybe log a finished flight, maybe push.
// Returns { notification, current } (used by scripts/test-flights.js).
async function run(deps) {
  const now = deps.now || (() => Date.now());
  // 1. Get the real, current next-flight data (same source app.js uses)
  let json;
  try {
    json = await deps.fetchJson(LL2_ENDPOINT);
  } catch (err) {
    console.log("Launch data unavailable right now — skipping this run, will retry in 15 min.");
    return { notification: null };
  }
  const launch = json.results?.[0];
  if (!launch) { console.log("No upcoming launch found — nothing to check."); return { notification: null }; }

  const match = launch.name.match(/Flight (\d+)/);
  const current = {
    n: match ? Number(match[1]) : null,
    status: mapLL2Status(launch.status?.abbrev),
    date: launch.net,
    precision: launch.net_precision?.abbrev || "",
    outcome: mapOutcome(launch.status?.abbrev),
  };

  // 2. Load what we saw last time we ran
  const prev = await deps.loadState();

  if (!prev) {
    console.log("First run — no previous data to compare against. Saving today's data as the baseline.");
    await deps.saveState(current);
    return { notification: null, current };
  }

  let notification = null;
  const sameFlight = prev.n === current.n;

  // 3. Has this flight's final result just come in, and have we not
  //    already handled it? If so, write the story and commit it —
  //    before anything else, since it changes what "current" means.
  if (current.outcome && prev.storyWrittenFor !== current.n) {
    console.log(`Flight ${current.n} result confirmed (${current.outcome}) — writing its story.`);
    try {
      const full = await deps.fetchJson(launch.url);
      const flightData = {
        n: current.n,
        outcome: current.outcome,
        date: current.date,
        pad: (full.pad?.name?.match(/Pad\s*(\d+)/i)?.[1] && `Pad ${full.pad.name.match(/Pad\s*(\d+)/i)[1]}`) || "",
        block: full.rocket?.configuration?.variant || "",
        booster: (full.rocket?.launcher_stage?.[0]?.launcher?.serial_number || "").replace(/^Booster\s*/i, "B"),
        ship: full.rocket?.spacecraft_stage?.[0]?.spacecraft?.serial_number || "",
        missionDescription: full.mission?.description || "",
      };

      const appJsText = deps.readAppJs();
      const styleExamples = recentStories(appJsText, 2);
      const { headline, story } = await deps.writeStory({ ...flightData, styleExamples });

      const updatedAppJs = addFlightToAppJs(appJsText, { ...flightData, headline, story });
      deps.writeAppJs(updatedAppJs);
      deps.commitAndPush(current.n, OUTCOME_LABEL[current.outcome]);

      current.storyWrittenFor = current.n;
      notification = { title: `🏁 Flight ${current.n} — ${OUTCOME_LABEL[current.outcome]}`, body: "The story's up in the app." };
      console.log(`Flight ${current.n} logged and pushed.`);
    } catch (err) {
      console.error("Story write/commit failed:", err);
      // fall through — still send the normal notifications below,
      // and we'll retry the story on the next run since storyWrittenFor
      // was never set.
    }
  } else if (prev.storyWrittenFor) {
    current.storyWrittenFor = prev.storyWrittenFor; // carry forward until it changes
  }
  if (prev.liftoffNotifiedFor != null && current.liftoffNotifiedFor == null) current.liftoffNotifiedFor = prev.liftoffNotifiedFor;

  // 4. Work out what changed, if anything, and pick the right message
  //    (skipped if we already have a completion notification above)
  if (!notification) {
    if (!sameFlight) {
      // A different flight is now first in LL2's list: switch silently.
      // (check-road.js sends "🚀 Road to Flight N" at 09:00 the next morning.)
      console.log(`Now tracking Flight ${current.n} (was ${prev.n}) — no push for the switch.`);
    } else if (current.status === "inflight") {
      // Liftoff: one push per flight. No date/status pushes while in the air
      // (LL2 usually moves "net" to the real liftoff time at this point).
      if (current.liftoffNotifiedFor !== current.n) {
        notification = { title: "🚀 Liftoff!", body: `Flight ${current.n} is in the air · Watch now` };
        current.liftoffNotifiedFor = current.n;
      }
    } else if (current.status === "done") {
      // the result push is the 🏁 one above
    } else if (prev.date !== current.date) {
      const delayed = new Date(current.date) > new Date(prev.date);
      // Earlier date: only say "confirmed" when LL2 has an exact time.
      // A rough date (e.g. NET 19 Oct, no time yet) is just a new estimate.
      notification = delayed
        ? { title: "🚧 Launch delayed", body: `Now ${fmtDateTime(current.date)}` }
        : isExactTime(current.precision)
          ? { title: "✅ Launch time confirmed", body: fmtDateTime(current.date) }
          : { title: "📅 New estimated date", body: `NET ${fmtEstimate(current.date, current.precision)}` };
    } else if (prev.status !== current.status && current.status === "confirmed") {
      notification = { title: "✅ Launch time confirmed", body: fmtDateTime(current.date) };
    } else if (prev.status !== current.status && STATUS_WORDS[current.status] && prev.status !== "inflight" && prev.status !== "done") {
      notification = { title: "⚠️ Flight update", body: `Now: ${STATUS_WORDS[current.status]}` };
    }
  }

  // 5. Livestream reminder — fires once, 60 minutes before liftoff
  const msUntilLaunch = new Date(current.date).getTime() - now();
  const alreadyNotifiedStream = prev.livestreamNotifiedFor === current.date;
  if (!notification && !alreadyNotifiedStream && current.status !== "inflight" && current.status !== "done" && msUntilLaunch > 0 && msUntilLaunch <= 60 * 60 * 1000) {
    notification = { title: "📡 Livestream ready", body: "Liftoff in 60 min - tap to watch" };
    current.livestreamNotifiedFor = current.date;
  } else if (prev.livestreamNotifiedFor) {
    current.livestreamNotifiedFor = prev.livestreamNotifiedFor; // carry it forward until the date changes
  }

  // 6. Send it
  if (notification) await deps.push(notification);
  else console.log("Checked — no change since last run.");

  // 7. Save today's data as the new "last known state" for next time
  await deps.saveState(current);
  return { notification, current };
}

module.exports = { run, mapLL2Status, fmtDateTime, addFlightToAppJs };

if (require.main === module) main().catch((err) => {
  console.error("Checker failed:", err);
  process.exit(1);
});
