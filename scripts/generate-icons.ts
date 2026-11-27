// Draws the app icons and the splash screen image from the mark in src/brand/mark.ts and writes
// them to assets/images, and the website's favicon and the emails' images to website/public. Run
// with `pnpm icons` after changing the mark.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import sharp from 'sharp';

import { BITE_CIRCLES, BRAND_ORANGE, HOLE, MARK_BOX, PLATE, RING } from '../src/brand/mark.ts';
import { darkColors } from '../src/theme/colors.ts';

const IMAGES_DIR = join(import.meta.dirname, '..', 'assets', 'images');
const WEBSITE_DIR = join(import.meta.dirname, '..', 'website', 'public');
const WHITE = '#FFFFFF';

type Drawing = {
  /** Side of the square image in pixels. */
  size: number;
  color: string;
  /** Fills the whole square; transparent without one. */
  background?: string;
  /** Draws the background as a circle, with transparent corners. */
  round?: boolean;
  /** Rounds the background's corners by this share of its side, with transparent corners. */
  corner?: number;
  bitten: boolean;
  /** Share of the image the mark's 100 × 100 box takes up. */
  scale: number;
};

function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

function markSvg({
  size,
  color,
  background,
  round = false,
  corner = 0,
  bitten,
  scale,
}: Drawing): string {
  const { cx, cy } = PLATE;
  const cuts = [
    `<circle cx="${cx}" cy="${cy}" r="${RING.r}" fill="none" stroke="#000" stroke-width="${RING.width}"/>`,
    circle(cx, cy, HOLE.r, '#000'),
    ...(bitten ? BITE_CIRCLES.map((bite) => circle(bite.cx, bite.cy, bite.r, '#000')) : []),
  ];
  const offset = (MARK_BOX * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_BOX} ${MARK_BOX}">
  <defs>
    <mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="${MARK_BOX}" height="${MARK_BOX}">
      ${circle(cx, cy, PLATE.r, '#fff')}
      ${cuts.join('\n      ')}
    </mask>
  </defs>
  ${background ? backgroundSvg(background, round, corner) : ''}
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <rect width="${MARK_BOX}" height="${MARK_BOX}" fill="${color}" mask="url(#mark)"/>
  </g>
</svg>`;
}

function backgroundSvg(fill: string, round: boolean, corner: number): string {
  const half = MARK_BOX / 2;
  return round
    ? circle(half, half, half, fill)
    : `<rect width="${MARK_BOX}" height="${MARK_BOX}" rx="${MARK_BOX * corner}" fill="${fill}"/>`;
}

// The splash image is only the plate, so `imageWidth` in app.json is the plate's width.
const PLATE_ONLY = MARK_BOX / (PLATE.r * 2);

// iOS needs an opaque square; the system rounds the corners. The three variants differ only in
// colour, so they share the rest.
const IOS_ICON = { size: 1024, bitten: true, scale: 0.85 };
/** The light icon, which the website's favicon also draws. */
const LIGHT_ICON: Drawing = { ...IOS_ICON, color: WHITE, background: BRAND_ORANGE };

const images: Record<string, Drawing> = {
  'icon.png': LIGHT_ICON,
  'ios-icon-dark.png': { ...IOS_ICON, color: darkColors.primary, background: darkColors.surface },
  // iOS tints the grey levels of this one in the tinted home screen style.
  'ios-icon-tinted.png': { ...IOS_ICON, color: WHITE, background: '#000000' },
  // Launchers crop the adaptive icon to the middle two thirds, so the mark stays well inside.
  // Android 13 also uses it as the monochrome layer for themed icons.
  'android-icon-foreground.png': { size: 1024, color: WHITE, bitten: true, scale: 0.6 },
  // The whole plate: the animation in the app takes the bite.
  'splash-icon.png': { size: 512, color: WHITE, bitten: false, scale: PLATE_ONLY },
  'splash-icon-dark.png': {
    size: 512,
    color: darkColors.primary,
    bitten: false,
    scale: PLATE_ONLY,
  },
};

for (const [file, drawing] of Object.entries(images)) {
  await sharp(Buffer.from(markSvg(drawing)))
    .png()
    .toFile(join(IMAGES_DIR, file));
  console.log(`Wrote assets/images/${file}`);
}

// The website's favicon: the light icon on a round ground, as a browser tab shows the icon as it
// is. The SVG stays sharp at every size; the PNG is for browsers without SVG favicons.
const FAVICON: Drawing = { ...LIGHT_ICON, round: true };
await writeFile(join(WEBSITE_DIR, 'favicon.svg'), `${markSvg({ ...FAVICON, size: 32 })}\n`);
console.log('Wrote website/public/favicon.svg');
await sharp(Buffer.from(markSvg({ ...FAVICON, size: 96 })))
  .png()
  .toFile(join(WEBSITE_DIR, 'favicon.png'));
console.log('Wrote website/public/favicon.png');

// The emails' images (ADR 0175), as PNGs, which mail clients show where many block SVG, at three
// times the size the emails draw them. Outlook does not round an image, so the corners are drawn.
const EMAIL_DIR = join(WEBSITE_DIR, 'images', 'email');
await mkdir(EMAIL_DIR, { recursive: true });
/** The icon's corner radius beside the name, as on the website (`CORNER_RATIO` in Brand.astro). */
const EMAIL_ICON_CORNER = 0.28;
await sharp(Buffer.from(markSvg({ ...LIGHT_ICON, size: 102, corner: EMAIL_ICON_CORNER })))
  .png()
  .toFile(join(EMAIL_DIR, 'icon.png'));
console.log('Wrote website/public/images/email/icon.png');
// Bite, happy, on a round ground of the brand's orange, for the welcome email.
const BITE_SIZE = 192;
const face = await sharp(await readFile(join(WEBSITE_DIR, 'images', 'bite-happy.svg')))
  .resize({ width: Math.round(BITE_SIZE * 0.8) })
  .png()
  .toBuffer();
const ground = `<svg xmlns="http://www.w3.org/2000/svg" width="${BITE_SIZE}" height="${BITE_SIZE}">${circle(BITE_SIZE / 2, BITE_SIZE / 2, BITE_SIZE / 2, BRAND_ORANGE)}</svg>`;
await sharp(Buffer.from(ground))
  .composite([{ input: face, gravity: 'center' }])
  .png()
  .toFile(join(EMAIL_DIR, 'bite.png'));
console.log('Wrote website/public/images/email/bite.png');
