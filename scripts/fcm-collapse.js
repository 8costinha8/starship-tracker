/* Collapse keys for FCM (batch 1, Rami-reported + verified: fcmMessage had none).
   Date / time / status pushes are "latest value wins": a newer one should REPLACE an older one that has not been shown yet
   (Android collapseKey, APNs apns-collapse-id, Web Push Topic) and replace the one already on screen (webpush notification tag).
   Never for liftoff, livestream, results, catch, deorbit, Road to Flight N or milestones: those must each arrive.
   Pure helpers; no network, no sending. Topic rule (Web Push): <= 32 chars of [A-Za-z0-9_-]. */
const DATE_STATUS = /^\W*(?:Launch delayed|Launch time confirmed|New estimated (?:date|time)|Flight update)\b/i;
function keyFor(n) {
  const title = String((n && n.title) || "");
  if (!DATE_STATUS.test(title)) return null;
  const fl = Number.isInteger(n.flight) ? n.flight : (String(n.body || "").match(/\bFlight (\d{1,3})\b/i) || [])[1];
  return `launch-date${fl ? "-f" + fl : ""}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
}
function decorate(message, n) {
  const key = keyFor(n); if (!key) return message;
  const wp = message.webpush || {};
  return {
    ...message,
    android: { ...(message.android || {}), collapseKey: key },
    apns: { ...(message.apns || {}), headers: { ...((message.apns || {}).headers || {}), "apns-collapse-id": key } },
    webpush: { ...wp, headers: { ...(wp.headers || {}), Topic: key, TTL: String(6 * 3600) }, notification: { ...(wp.notification || {}), tag: key, renotify: true } },
  };
}
module.exports = { keyFor, decorate, DATE_STATUS };
