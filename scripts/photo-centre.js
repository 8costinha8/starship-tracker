/* Photo centring (24 Nov, Bernardo via Tusk): a card photo is cut so the NAMED VEHICLE sits in the horizontal centre of
   the frame. Pure (no files, no network); Node + browser (window.PhotoCentre).
   centreCrop({ w, h }, box, { aspect, avoid, top }) → { x, y, w, h }: the largest crop of the given aspect (16:9 cards)
     whose centre is the vehicle's centre, that keeps the whole vehicle width, and that stays clear of every `avoid`
     rectangle (watermarks); `top` = the top edge to keep (e.g. just above the vehicle's top); `maxW` keeps an
     approved zoom (the crop is never wider than that).
   offCentre(box, { w, h }, slot) → how far the vehicle's centre sits from the centre of the visible frame, as a fraction
     of the frame width, once the image is cover-fitted into the slot (16:9 at 390 px; object-position centre).
   Boxes are [x0, y0, x1, y1] in source pixels; road-media.json picks store `vehicle_box` as fractions of the saved image. */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PhotoCentre = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const hit = (a, b) => a.x < b[2] && a.x + a.w > b[0] && a.y < b[3] && a.y + a.h > b[1];
  function centreCrop(img, box, { aspect = 16 / 9, avoid = [], top = null, maxW = Infinity } = {}) {
    const cx = (box[0] + box[2]) / 2, half = Math.min(cx, img.w - cx);
    for (let w = Math.floor(Math.min(2 * half, maxW)); w >= box[2] - box[0]; w -= 2) {
      const h = Math.round(w / aspect); if (h > img.h) continue;
      const x = Math.round(cx - w / 2);
      const ys = top != null ? [Math.max(0, Math.min(top, img.h - h))] : [];
      for (let y = 0; y + h <= img.h; y += 5) ys.push(y);
      for (const y of ys) { const r = { x, y, w, h }; if (!avoid.some((a) => hit(r, a)) && (top == null || y <= top)) return r; }
    }
    return null;
  }
  function offCentre(box, img, slot = { w: 366, h: 206 }) {
    const s = Math.max(slot.w / img.w, slot.h / img.h), vw = slot.w / s, x0 = (img.w - vw) / 2; // cover, centred
    return ((box[0] + box[2]) / 2 - x0) / vw - 0.5;
  }
  return { centreCrop, offCentre };
});
