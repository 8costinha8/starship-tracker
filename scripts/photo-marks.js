/* Source marks burned into photos (24 Nov v5). Pure; Node (require) and browser (window.PhotoMarks).
   Rule: a card photo that already shows its source's logo / watermark in the visible crop does not also get the round
   source badge (two logos on one picture). The badge stays when the mark is cropped out, or the photo has no mark.
   Marks are recorded per image (handle + the mark's box as fractions of the full image, x0 y0 x1 y1): no automatic logo
   detection, a new marked photo needs its entry here (scripts/test-photo-marks.js checks each entry against its crop). */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PhotoMarks = factory(); })(typeof self !== "undefined" ? self : this, function () {
  const MARKS = [
    // RGV Aerial Photography livestream thumb (B24 cryo, post 2124765411627643131): RGV logo top right
    { match: "amplify_video_thumb/2124764895292133376/img/OZnACetsr9Q5nFho", handle: "RGVaerialphotos", w: 1200, h: 675, box: [0.895, 0.03, 0.98, 0.184] },
  ];
  const markOf = (image) => (image ? MARKS.find((m) => String(image).includes(m.match)) || null : null);
  // visible window of a cover-cropped image, in fractions of the image: centred across, top / bottom / centre down
  function windowOf(w, h, aspect, crop) {
    const ia = w / h; let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
    if (ia > aspect) { const f = aspect / ia; x0 = (1 - f) / 2; x1 = x0 + f; }
    else if (ia < aspect) { const f = ia / aspect; if (crop === "bottom") { y0 = 1 - f; } else if (crop === "center") { y0 = (1 - f) / 2; } y1 = y0 + f; }
    return [x0, y0, x1, y1];
  }
  // share of the mark's area inside the visible window
  function shown(mark, aspect, crop) {
    const [a0, b0, a1, b1] = windowOf(mark.w, mark.h, aspect, crop), [x0, y0, x1, y1] = mark.box;
    const iw = Math.max(0, Math.min(x1, a1) - Math.max(x0, a0)), ih = Math.max(0, Math.min(y1, b1) - Math.max(y0, b0));
    return (iw * ih) / ((x1 - x0) * (y1 - y0));
  }
  // hide the round badge when at least a third of the source's mark is on screen (a cut logo still reads as a logo)
  const SHOWN_MIN = 1 / 3;
  const hideBadge = (image, aspect = 16 / 9, crop = "top") => { const m = markOf(image); return !!m && shown(m, aspect, crop) >= SHOWN_MIN; };
  return { MARKS, markOf, windowOf, shown, hideBadge, SHOWN_MIN };
});
