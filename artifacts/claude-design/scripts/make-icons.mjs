// Builds every icon Baketly needs from the one drawing of the mark.
//
// The source is resources/icon-source.jpg: a cream loaf on a dark green tile,
// with the tile's corners already rounded and the area outside them white.
// That white is the whole reason this is not a plain resize — iOS rounds the
// corners itself, so a tile carrying its own rounded corners shows white
// slivers along the edges of the home screen.
//
// So the drawing is masked back to its own rounded rectangle, and what is left
// sits on a green square that runs to all four edges. iOS then cuts the only
// curve the icon ever shows.
//
// Run with: node scripts/make-icons.mjs

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

// sampled from the artwork rather than guessed
const GREEN = "#063930";
const CREAM = "#faf6f0";

const SOURCE = path.resolve(root, "resources/icon-source.jpg");
// the corner radius the artwork was drawn with, as a fraction of its width
const CORNER = 0.18;

/**
 * The mark, full bleed, at any size.
 *
 * The mask is drawn at the output size rather than the source's, so the
 * rounding lands exactly on the artwork's own corners however far it is
 * scaled.
 */
async function markSquare(size) {
  // A shade inside the artwork's own edge, not on it. The drawing's rounded
  // corner is anti-aliased — a thin band where white fades into green — and a
  // mask laid exactly on that line keeps the pale half of it, which reads as a
  // ring around the icon. Cutting a little further in throws the whole band
  // away, and the green behind fills what is taken.
  const inset = Math.max(1, Math.round(size * 0.015));
  const radius = Math.round(size * CORNER) - inset;
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <rect x="${inset}" y="${inset}" width="${size - inset * 2}" height="${size - inset * 2}"
             rx="${radius}" ry="${radius}" fill="#fff"/>
     </svg>`,
  );

  // everything outside the artwork's own rounded corners is dropped
  const tile = await sharp(SOURCE)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  // and what is left is laid on green that reaches the edges
  return sharp({
    create: { width: size, height: size, channels: 4, background: GREEN },
  })
    .composite([{ input: tile }])
    // an iOS app icon may not carry transparency at all, and the store
    // refuses an upload that does
    .flatten({ background: GREEN })
    .removeAlpha()
    .png()
    .toBuffer();
}

/** The mark, centred on the app's own background, for the launch screen. */
async function splashImage(size, markSize) {
  const mark = await markSquare(markSize);
  return sharp({
    create: { width: size, height: size, channels: 4, background: CREAM },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .flatten({ background: CREAM })
    .png()
    .toBuffer();
}

/**
 * The loaf on its own, green, with nothing behind it.
 *
 * The app's waiting screen wants the shape rather than the whole tile, and
 * lifting it out of the same artwork keeps the two from drifting apart. The
 * drawing is cream on dark green, so how cream a pixel is becomes how opaque
 * it is, and the colour is painted on flat underneath.
 */
async function loafSilhouette(size) {
  // from the finished tile, not the raw artwork: the artwork is white outside
  // its own rounded corners, and white reads as loaf
  const source = await sharp(await markSquare(size))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = source;
  const out = Buffer.alloc(info.width * info.height * 4);
  const ink = [0x06, 0x39, 0x30];
  for (let pixel = 0; pixel < info.width * info.height; pixel++) {
    const at = pixel * info.channels;
    // how bright the pixel is: the loaf is near-white, the tile near-black
    const luma = 0.299 * data[at] + 0.587 * data[at + 1] + 0.114 * data[at + 2];
    // a soft edge between the two, so the curve stays smooth
    // The loaf sits around 250 and the tile around 40, so the crossing is put
    // well above the ringing a JPEG leaves along the tile edge — that ringing
    // reaches about 120, and anything below 150 is treated as background.
    let alpha = Math.max(0, Math.min(1, (luma - 150) / 70));
    // and a hard floor: the tile edge leaves a hairline of barely-there pixels
    // that is invisible but enough to defeat the trim below, which would leave
    // the loaf floating in a square of nothing
    if (alpha < 0.12) alpha = 0;
    out[pixel * 4] = ink[0];
    out[pixel * 4 + 1] = ink[1];
    out[pixel * 4 + 2] = ink[2];
    out[pixel * 4 + 3] = Math.round(alpha * 255);
  }

  // The shape's own bounds, measured rather than trimmed. sharp's trim starts
  // from the corner pixel and stops at the first thing it meets, and what it
  // meets is a scattering of stray pixels along the tile's rounded edge — a
  // handful per row, invisible, but enough to leave the loaf adrift in a
  // square of nothing. So a row or column only counts as part of the shape
  // once it holds a real run of ink.
  const minimumRun = Math.max(4, Math.round(info.width * 0.02));
  const inkPerRow = new Array(info.height).fill(0);
  const inkPerColumn = new Array(info.width).fill(0);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (out[(y * info.width + x) * 4 + 3] < 32) continue;
      inkPerRow[y]++;
      inkPerColumn[x]++;
    }
  }

  const firstAbove = (counts) => counts.findIndex((count) => count >= minimumRun);
  const lastAbove = (counts) => {
    for (let at = counts.length - 1; at >= 0; at--) if (counts[at] >= minimumRun) return at;
    return -1;
  };
  const top = firstAbove(inkPerRow);
  const bottom = lastAbove(inkPerRow);
  const left = firstAbove(inkPerColumn);
  const right = lastAbove(inkPerColumn);
  if (right < left || bottom < top) throw new Error("no shape found in the mark");

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
    .png()
    .toBuffer();
}

const ios = "ios/App/App/Assets.xcassets";

const icons = [
  // what the App Store asks for, and the source of truth for the rest
  { file: "resources/icon.png", size: 1024 },
  // straight into the Xcode project, so a redrawn mark reaches the phone
  // without a second tool having to be run on the Mac
  { file: `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, size: 1024 },
  // the home screen on the web, and the browser tab
  { file: "public/apple-touch-icon.png", size: 180 },
  { file: "public/icon-512.png", size: 512 },
  { file: "public/icon-192.png", size: 192 },
];

for (const target of icons) {
  const out = path.resolve(root, target.file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(await markSquare(target.size)).toFile(out);
  console.log("wrote", target.file, `${target.size}px`);
}

const splashes = [
  "resources/splash.png",
  `${ios}/Splash.imageset/splash-2732x2732.png`,
  `${ios}/Splash.imageset/splash-2732x2732-1.png`,
  `${ios}/Splash.imageset/splash-2732x2732-2.png`,
];

// the shape alone, for the moment the app is opening
await sharp(await loafSilhouette(512)).toFile(path.resolve(root, "public/loaf-mark.png"));
console.log("wrote public/loaf-mark.png");

const splash = await splashImage(2732, 640);
for (const file of splashes) {
  const out = path.resolve(root, file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(splash).toFile(out);
  console.log("wrote", file, "2732px");
}
