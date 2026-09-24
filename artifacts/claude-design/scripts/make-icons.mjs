// Builds the app's icons from the mark the app already wears.
//
// The loading tile in index.html is a cream loaf on olive green, and that is
// what a baker already associates with Baketly. Rather than commissioning a
// second logo that drifts from the first, the same drawing is rendered here at
// the sizes iOS and the web ask for.
//
// Run with: node scripts/make-icons.mjs

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const GREEN = "#8e9a48";
const CREAM = "#faf6f0";

/**
 * The mark, at any size.
 *
 * iOS masks its own rounded corners, so the square is drawn square and full
 * bleed; the loaf sits on the optical centre rather than the geometric one,
 * which reads better once the corners are cut.
 */
const markSvg = (size, background = GREEN) => {
  // The loaf is drawn in its own 20-wide coordinates and blown up to fill most
  // of the tile: an app icon is read at 60px on a home screen, and the mark as
  // the loading tile draws it is far too small and sits too low to survive
  // that. Scaled to about two thirds the width and nudged above centre, which
  // is where the eye expects the middle once iOS rounds the corners off.
  const scale = 3.2;
  const x = 50 - (20 * scale) / 2 - 2 * scale;
  const y = 48 - ((18.5 - 8) * scale) / 2 - 8 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="${background}"/>
  <g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${scale})" fill="none" stroke="${CREAM}"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 16.5v-2c0-3.5 4-6.5 10-6.5s10 3 10 6.5v2z"/>
    <path d="M8 10.5l1.6 1.6M12.8 10l1.6 1.6M17 10.6l1.5 1.5"/>
  </g>
</svg>`;
};

const targets = [
  // what Capacitor's iOS project expects, and what the store asks for
  { file: "resources/icon.png", size: 1024 },
  { file: "resources/splash.png", size: 2732, background: CREAM, mark: 640 },
  { file: "public/apple-touch-icon.png", size: 180 },
  { file: "public/icon-512.png", size: 512 },
  { file: "public/icon-192.png", size: 192 },
  // straight into the Xcode project, so a rebuilt mark reaches the phone
  // without a second tool having to be run on the Mac
  { file: "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", size: 1024 },
  { file: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png", size: 2732, background: CREAM, mark: 640 },
  { file: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png", size: 2732, background: CREAM, mark: 640 },
  { file: "ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png", size: 2732, background: CREAM, mark: 640 },
];

for (const target of targets) {
  const out = path.resolve(root, target.file);
  await mkdir(path.dirname(out), { recursive: true });

  if (target.mark) {
    // a splash is the mark centred on the app's own background, not stretched
    const mark = await sharp(Buffer.from(markSvg(target.mark))).png().toBuffer();
    await sharp({
      create: {
        width: target.size,
        height: target.size,
        channels: 4,
        background: target.background,
      },
    })
      .composite([{ input: mark, gravity: "centre" }])
      .png()
      .toFile(out);
  } else {
    await sharp(Buffer.from(markSvg(target.size, target.background)))
      .png()
      .toFile(out);
  }
  console.log("wrote", target.file, target.size + "px");
}

// the source, kept so the icon can be redrawn or handed to a designer
await writeFile(path.resolve(root, "resources/icon.svg"), markSvg(1024), "utf8");
console.log("wrote resources/icon.svg");
