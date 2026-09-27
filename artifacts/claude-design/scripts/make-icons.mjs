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

const splash = await splashImage(2732, 640);
for (const file of splashes) {
  const out = path.resolve(root, file);
  await mkdir(path.dirname(out), { recursive: true });
  await sharp(splash).toFile(out);
  console.log("wrote", file, "2732px");
}
