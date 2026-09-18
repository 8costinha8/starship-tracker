/* ─────────────────────────────────────────────────────────────
   Runs on a schedule (see .github/workflows/flight-checker.yml).
   Checks the real Starship flight data, compares it to what it
   saw last time, and — only if something actually changed —
   sends the right notification to everyone subscribed.

   First-ever run: there's no "last time" yet, so it just saves
   today's data as the starting point. No notification fires on
   that first run, on purpose — otherwise everyone would get a
   push the moment this goes live, even though nothing changed.
   ───────────────────────────────────────────────────────────── */

const admin = require("firebase-admin");

const LL2_ENDPOINT = "https://ll.thespacedevs.com/2.3.0/launches/upcoming/?search=Starship&limit=1&mode=list";

function mapLL2Status(abbrev) {
  if (abbrev === "Go") return "confirmed";
  if (abbrev === "TBC") return "net";
  return "tbc";
}

// e.g. "28 Sep 13:15" — same short style used across the app
function fmtDateTime(iso) {
  const d = new Date(iso);
  const day = d.getUTCDate();
  const month = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${hh}:${mm}`;
}

async function main() {
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

  // 3. Work out what changed, if anything, and pick the right message
  let notification = null;

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

  // 4. Livestream reminder — fires once, 60 minutes before liftoff
  const msUntilLaunch = new Date(current.date).getTime() - Date.now();
  const alreadyNotifiedStream = prev.livestreamNotifiedFor === current.date;
  if (!notification && !alreadyNotifiedStream && msUntilLaunch > 0 && msUntilLaunch <= 60 * 60 * 1000) {
    notification = { title: "📡 Livestream ready", body: "Liftoff in 60 min - tap to watch" };
    current.livestreamNotifiedFor = current.date;
  } else if (prev.livestreamNotifiedFor) {
    current.livestreamNotifiedFor = prev.livestreamNotifiedFor; // carry it forward until the date changes
  }

  // 5. Send it — data-only message, so our own service worker decides
  //    exactly what to show (one banner, our exact wording, no duplicates)
  if (notification) {
    const subs = await db.collection("subscribers").get();
    const tokens = subs.docs.map((d) => d.id);

    if (tokens.length) {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: notification.title, body: notification.body },
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

  // 6. Save today's data as the new "last known state" for next time
  await stateRef.set(current);
}

main().catch((err) => {
  console.error("Checker failed:", err);
  process.exit(1);
});
