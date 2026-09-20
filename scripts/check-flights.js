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
   Photo and highlight-video stay untouched — Bernardo adds those by
   hand later. Once the "next flight" the live feed reports moves on
   to the new number, the existing notification logic below already
   announces that on its own — no extra code needed for that part.

   First-ever run: there's no "last time" yet, so it just saves
   today's data as the starting point. No notification fires on
   that first run, on purpose — otherwise everyone would get a
   push the moment this goes live, even though nothing changed.
   ───────────────────────────────────────────────────────────── */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LL2_ENDPOINT = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=1&mode=list";
const APP_JS_PATH = path.join(__dirname, "..", "app.js");
const ANTHROPIC_MODEL = "claude-sonnet-5";

function mapLL2Status(abbrev) {
  if (abbrev === "Go") return "confirmed";
  if (abbrev === "TBC") return "net";
  return "tbc";
}

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

// Pulls the last N `story:` blocks out of app.js as-is, just to give
// Claude a feel for the voice — not a full parse, doesn't need to be.
function recentStories(appJsText, count) {
  const re = /story:\s*"((?:[^"\\]|\\.)*)"/g;
  const matches = [...appJsText.matchAll(re)];
  return matches.slice(-count).map((m) => m[1]);
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
- Official mission description: ${missionDescription || "(none available)"}

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
    console.log("Style reference pulled from app.js:", styleExamples);

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

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  // 1. Get the real, current next-flight data (same source app.js uses)
  const res = await fetch(LL2_ENDPOINT);
  const json = await res.json();
  const launch = json.results?.[0];
  if (!launch) { console.log("No upcoming launch found — nothing to check."); return; }

  const match = launch.name.match(/Flight (\d+)/);
  const current = {
    n: match ? Number(match[1]) : null,
    status: mapLL2Status(launch.status?.abbrev),
    date: launch.net,
    outcome: mapOutcome(launch.status?.abbrev),
  };

  // 2. Load what we saw last time we ran
  const stateRef = db.collection("app-state").doc("next-flight");
  const stateSnap = await stateRef.get();
  const prev = stateSnap.exists ? stateSnap.data() : null;

  if (!prev) {
    console.log("First run — no previous data to compare against. Saving today's data as the baseline.");
    await stateRef.set(current);
    return;
  }

  let notification = null;

  // 3. Has this flight's final result just come in, and have we not
  //    already handled it? If so, write the story and commit it —
  //    before anything else, since it changes what "current" means.
  if (current.outcome && prev.storyWrittenFor !== current.n) {
    console.log(`Flight ${current.n} result confirmed (${current.outcome}) — writing its story.`);
    try {
      const detailRes = await fetch(launch.url);
      const full = await detailRes.json();
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

      const appJsText = fs.readFileSync(APP_JS_PATH, "utf8");
      const styleExamples = recentStories(appJsText, 2);
      const { headline, story } = await writeStory({ ...flightData, styleExamples });

      const updatedAppJs = addFlightToAppJs(appJsText, { ...flightData, headline, story });
      fs.writeFileSync(APP_JS_PATH, updatedAppJs);
      commitAndPush(current.n, OUTCOME_LABEL[current.outcome]);

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

  // 4. Work out what changed, if anything, and pick the right message
  //    (skipped if we already have a completion notification above)
  if (!notification) {
    if (prev.date !== current.date) {
      const delayed = new Date(current.date) > new Date(prev.date);
      notification = delayed
        ? { title: "🚧 Launch delayed", body: `Now ${fmtDateTime(current.date)}` }
        : { title: "✅ Launch time confirmed", body: fmtDateTime(current.date) };
    } else if (prev.status !== current.status && current.status === "confirmed") {
      notification = { title: "✅ Launch time confirmed", body: fmtDateTime(current.date) };
    } else if (prev.status !== current.status) {
      notification = { title: "⚠️ Flight update", body: `Status changed to ${current.status}` };
    } else if (prev.n !== current.n) {
      notification = { title: "⚠️ Flight update", body: `Now tracking Flight ${current.n}` };
    }
  }

  // 5. Livestream reminder — fires once, 60 minutes before liftoff
  const msUntilLaunch = new Date(current.date).getTime() - Date.now();
  const alreadyNotifiedStream = prev.livestreamNotifiedFor === current.date;
  if (!notification && !alreadyNotifiedStream && msUntilLaunch > 0 && msUntilLaunch <= 60 * 60 * 1000) {
    notification = { title: "📡 Livestream ready", body: "Liftoff in 60 min - tap to watch" };
    current.livestreamNotifiedFor = current.date;
  } else if (prev.livestreamNotifiedFor) {
    current.livestreamNotifiedFor = prev.livestreamNotifiedFor; // carry it forward until the date changes
  }

  // 6. Send it — data-only message, so our own service worker decides
  //    exactly what to show (one banner, our exact wording, no duplicates)
  if (notification) {
    const subs = await db.collection("subscribers").get();
    const tokens = subs.docs.map((d) => d.id);

    if (tokens.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: notification.title, body: notification.body },
      });
      console.log(`Sent "${notification.title}" to ${resp.successCount}/${tokens.length} device(s).`);

      // quietly remove any tokens that failed (phone uninstalled the app, etc.)
      resp.responses.forEach((r, i) => {
        if (!r.success) db.collection("subscribers").doc(tokens[i]).delete().catch(() => {});
      });
    } else {
      console.log(`Would have sent "${notification.title}" — but there are no subscribers yet.`);
    }
  } else {
    console.log("Checked — no change since last run.");
  }

  // 7. Save today's data as the new "last known state" for next time
  await stateRef.set(current);
}

main().catch((err) => {
  console.error("Checker failed:", err);
  process.exit(1);
});
