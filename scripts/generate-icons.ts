// Draws the app icons and the splash screen image from the mark in src/brand/mark.ts and writes
// them to assets/images. Run with `pnpm icons` after changing the mark.
import { join } from 'node:path';

import sharp from 'sharp';

import {
  BITE_CIRCLES,
  BRAND_ORANGE,
  BRAND_ORANGE_DARK,
  BRAND_SURFACE_DARK,
  HOLE,
  MARK_BOX,
  PLATE,
  RING,
} from '../src/brand/mark.ts';

const IMAGES_DIR = join(import.meta.dirname, '..', 'assets', 'images');
const WHITE = '#FFFFFF';

type Drawing = {
  /** Side of the square image in pixels. */
  size: number;
  color: string;
  /** Fills the whole square; transparent without one. */
  background?: string;
  bitten: boolean;
  /** Share of the image the mark's 100 × 100 box takes up. */
  scale: number;
};

function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

function markSvg({ size, color, background, bitten, scale }: Drawing): string {
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
  ${background ? `<rect width="${MARK_BOX}" height="${MARK_BOX}" fill="${background}"/>` : ''}
  <g transform="translate(${offset} ${offset}) scale(${scale})">
    <rect width="${MARK_BOX}" height="${MARK_BOX}" fill="${color}" mask="url(#mark)"/>
  </g>
</svg>`;
}

// The splash image is only the plate, so `imageWidth` in app.json is the plate's width.
const PLATE_ONLY = MARK_BOX / (PLATE.r * 2);

const images: Record<string, Drawing> = {
  // iOS needs an opaque square; the system rounds the corners.
  'icon.png': { size: 1024, color: WHITE, background: BRAND_ORANGE, bitten: true, scale: 0.85 },
  'ios-icon-dark.png': {
    size: 1024,
    color: BRAND_ORANGE_DARK,
    background: BRAND_SURFACE_DARK,
    bitten: true,
    scale: 0.85,
  },
  // iOS tints the grey levels of this one in the tinted home screen style.
  'ios-icon-tinted.png': {
    size: 1024,
    color: WHITE,
    background: '#000000',
    bitten: true,
    scale: 0.85,
  },
  // Launchers crop the adaptive icon to the middle two thirds, so the mark stays well inside.
  // Android 13 also uses it as the monochrome layer for themed icons.
  'android-icon-foreground.png': { size: 1024, color: WHITE, bitten: true, scale: 0.6 },
  // The whole plate: the animation in the app takes the bite.
  'splash-icon.png': { size: 512, color: WHITE, bitten: false, scale: PLATE_ONLY },
  'splash-icon-dark.png': { size: 512, color: BRAND_ORANGE_DARK, bitten: false, scale: PLATE_ONLY },
};

for (const [file, drawing] of Object.entries(images)) {
  await sharp(Buffer.from(markSvg(drawing)))
    .png()
    .toFile(join(IMAGES_DIR, file));
  console.log(`Wrote assets/images/${file}`);
}
