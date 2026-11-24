/* Source marks burned into photos (24 Nov v5). Pure; Node (require) and browser (window.PhotoMarks).
   Rule: a card photo that already shows its source's logo / watermark in the visible crop does not also get the round
   source badge (two logos on one picture). The badge stays when the mark is cropped out, or the photo has no mark.
   Marks are recorded per image (handle + the mark's box as fractions of the full image, x0 y0 x1 y1): no automatic logo
   detection, a new marked photo needs its entry here (scripts/test-photo-marks.js checks each entry against its crop). */
(function (root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.PhotoMarks = factory(); })(typeof self !== "undefined" ? self : this, function () {
  /* Source marks: the stream / agency / photographer whose logo is burned into a picture (or was, before our crop). Credit:
     the mark's account IS the photo's original source (a Starbase Live still reposted by @Blobifie is NSF's). Badge: hidden
     only when the mark's box (fractions of the saved image) is at least a third inside the card's crop (the logo already
     shows); box null = cut out of our saved crop → the mark's account gets the badge. Recorded by eye from each picture
     (24 Nov v6 audit of every photo post on the roads); no automatic logo detection. Shape:
     { match: "<part of the image url>", handle, name, w, h, box: [x0, y0, x1, y1] | null } */
  const MARKS = [
    { match: "b24-cryo-blobifie-nsf-clean", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1280, h: 720, box: null }, // Bernardo's B24 cryo pick (posted by @Blobifie): NSF Starbase Live still; timestamp bar and ticker cut off, so no mark in the saved crop → NSF badge shown
    { match: "HVWEyTyaQAA-KCA", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.0, 0.935, 0.11, 0.995] }, // S43 cryo start, posted by @Blobifie
    { match: "HUdSuq2a8AAAfgu", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.0, 0.935, 0.11, 0.995] }, // B23 on the cryo stand, posted by @Blobifie
    { match: "HVmQW1fbIAA2hgT", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.0, 0.935, 0.11, 0.995] }, // S43 lifted to the top of the tower, posted by @Blobifie
    { match: "-O9edRhQ2f3cSP-A", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.0, 0.935, 0.11, 0.995] }, // S44 + B24 back to the Megabays, posted by @Blobifie
    { match: "HX1rvC_aUAA5OEe", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1989, h: 1119, box: [0.0, 0.935, 0.11, 0.995] }, // S44 3rd cryo test, posted by @Blobifie
    { match: "HX3sqLlaUAAWG6V", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1989, h: 1119, box: [0.0, 0.935, 0.11, 0.995] }, // B24 leaving Massey's, posted by @Blobifie
    { match: "HU4y2cUbwAE6od-", handle: "NASASpaceflight", name: "NSF", w: 1150, h: 810, box: [0.8, 0.02, 0.99, 0.14] }, // B23 on HWY 4, posted by @TrackingTheSB (text also credits @NASASpaceflight)
    { match: "HVsYHvSaQAAzZ3c", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 910, box: [0.7, 0.83, 0.95, 0.97] }, // S43 into Megabay 2, posted by @TrackingTheSB (text: 📷NSF)
    { match: "dw7Zle9xo9YHSp0k", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.8, 0.79, 0.98, 0.97] }, // Pad 2 OLM, posted by @efraser77
    { match: "fBDA16Mj6GuEouvs", handle: "NASASpaceflight", name: "NSF Starbase Live", w: 1200, h: 675, box: [0.82, 0.83, 0.97, 0.96] }, // S44 frost at Massey's, posted by @efraser77
    { match: "HXdeREuXIAAswmd", handle: "TrackingTheSB", name: "Starship Tracking (Casper Harris)", w: 1200, h: 800, box: [0.8, 0.82, 0.96, 0.95] }, // Pad 2 after Flight 15, own mark (mostly below a 16:9 crop)
    { match: "45WwvTRmJ8YoB0Fq", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.85, 0.02, 0.99, 0.24] }, // own mark
    { match: "I7qk6Tawvh4EgZDs", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.85, 0.02, 0.99, 0.24] }, // own mark
    { match: "5lOEfOOxQggVRbIU", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.85, 0.02, 0.99, 0.24] }, // own mark
    { match: "iKqB-vmKXQVQk3TQ", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.85, 0.02, 0.99, 0.24] }, // own mark
    { match: "ovA0QnDhaVHHIPLv", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.85, 0.02, 0.99, 0.24] }, // own mark
    { match: "OZnACetsr9Q5nFho", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 675, box: [0.895, 0.03, 0.98, 0.184] }, // own mark (the old B24 cryo photo; on no card since Bernardo's pick)
    { match: "HRzT1OnWYAEDCml", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 800, box: [0.88, 0.8, 0.99, 0.98] }, // own mark
    { match: "HTwdsecaIAAK_9e", handle: "RGVaerialphotos", name: "RGV", w: 1200, h: 800, box: [0.0, 0.75, 0.13, 0.98] }, // own mark
    { match: "HXge4cxXMAAUSbz", handle: "RGVaerialphotos", name: "RGV", w: 3840, h: 2160, box: [0.0, 0.72, 0.2, 0.98] }, // own mark
  ];
  const markOf = (image, marks = MARKS) => (image ? marks.find((m) => String(image).includes(m.match)) || null : null);
  // visible window of a cover-cropped image, in fractions of the image: centred across, top / bottom / centre down
  function windowOf(w, h, aspect, crop) {
    const ia = w / h; let x0 = 0, x1 = 1, y0 = 0, y1 = 1;
    if (ia > aspect) { const f = aspect / ia; x0 = (1 - f) / 2; x1 = x0 + f; }
    else if (ia < aspect) { const f = ia / aspect; if (crop === "bottom") { y0 = 1 - f; } else if (crop === "center") { y0 = (1 - f) / 2; } y1 = y0 + f; }
    return [x0, y0, x1, y1];
  }
  // share of the mark's area inside the visible window
  function shown(mark, aspect, crop) {
    if (!mark.box) return 0;
    const [a0, b0, a1, b1] = windowOf(mark.w, mark.h, aspect, crop), [x0, y0, x1, y1] = mark.box;
    const iw = Math.max(0, Math.min(x1, a1) - Math.max(x0, a0)), ih = Math.max(0, Math.min(y1, b1) - Math.max(y0, b0));
    return (iw * ih) / ((x1 - x0) * (y1 - y0));
  }
  // hide the round badge when at least a third of the source's mark is on screen (a cut logo still reads as a logo)
  const SHOWN_MIN = 1 / 3;
  const hideBadge = (image, aspect = 16 / 9, crop = "top", marks = MARKS) => { const m = markOf(image, marks); return !!m && shown(m, aspect, crop) >= SHOWN_MIN; };

  /* 24 Nov v6 credit rule (Bernardo): the round badge is the photo's CREDITED ORIGINAL SOURCE when the post names one, and
     the posting account only when there is none. Credited = (1) a source mark recorded above (in the crop or cut off), else
     (2) the post's own credit: "📸 / 📷 / 🎥 X", "photo(s) by X", "photo: X", "credit: X", "via @X", or a line "For X".
     In a credit, a named agency with a known account wins (the logo is the agency's: "For WAI Media @FelixSchlang",
     "📷 Oct 23. @Jordanguidry6 - WAI Media" → @FelixSchlang; "📷NSF | Starbase Live" → @NASASpaceflight), then the first
     @handle; a name with no known account ("📸Avidspace") falls back to the poster (reported, not guessed). */
  const ORGS = [
    [/\bWAI\s*Media\b/i, "FelixSchlang"],
    [/\b(?:NSF|NASA\s?Spaceflight|Starbase\s+Live)\b/i, "NASASpaceflight"],
    [/\bStarship\s+Tracking\b/i, "TrackingTheSB"],
    [/\bLabPadre\b/i, "LabPadre"],
    [/\bRGV\s+Aerial\b/i, "RGVaerialphotos"],
  ];
  const unesc = (t) => String(t || "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  function creditLines(text) {
    const t = unesc(text), out = [];
    for (const m of t.matchAll(/(?:📸|📷|🎥)\s*:?\s*([^\n]*)/gu)) out.push(m[1]);
    for (const m of t.matchAll(/\b(?:photos?\s+by|photo\s*:|credit\s*:|image\s+by)\s*([^\n]*)/giu)) out.push(m[1]);
    for (const m of t.matchAll(/\bvia\s+(@\w{1,15})/giu)) out.push(m[1]);
    for (const m of t.matchAll(/(?:^|\n)\s*for\s+([^\n]{1,60})/giu)) if (/@\w|\b[A-Z][\w]*\s+Media\b/.test(m[1]) || ORGS.some(([re]) => re.test(m[1]))) out.push(m[1]);
    return out.map((l) => l.replace(/https?:\/\/\S+/g, " ").replace(/#\w+/g, " ").trim()).filter(Boolean);
  }
  // → { handle, via: "mark" | "credit" | "poster", name? } (handle without "@")
  function creditOf(text, { poster = "", image = null, aspect = 16 / 9, crop = "top", marks = MARKS } = {}) {
    const p = String(poster || "").replace(/^@/, "");
    const m = markOf(image, marks); if (m) return { handle: m.handle, via: "mark", name: m.name, shown: !!m.box && shown(m, aspect, crop) >= SHOWN_MIN };
    for (const line of creditLines(text)) {
      const org = ORGS.find(([re]) => re.test(line)); if (org) return { handle: org[1], via: "credit", name: (line.match(org[0]) || [])[0] };
      const h = line.match(/@(\w{1,15})/); if (h) return { handle: h[1], via: "credit" };
      return { handle: p, via: "poster", name: line.split(/\s*\|\s*/)[0].trim(), unresolved: true }; // named, no known account
    }
    return { handle: p, via: "poster" };
  }
  return { MARKS, markOf, windowOf, shown, hideBadge, SHOWN_MIN, ORGS, creditLines, creditOf };
});
