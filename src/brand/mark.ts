// The Benchbite mark: a weight plate with a bite taken out of it. One source for the app icon,
// the splash screen and the in-app animation, so they all draw the same shape. Coordinates are
// in a 100 × 100 box with the plate in the middle.

/** The brand orange behind the light icon and splash screen. */
export const BRAND_ORANGE = '#FF6A10';
/** The mark's colour on dark backgrounds. */
export const BRAND_ORANGE_DARK = '#FF7F26';
/** The dark icon's background. */
export const BRAND_SURFACE_DARK = '#1B1C1F';
/** The dark splash screen's background, the app's dark background. */
export const BRAND_BACKGROUND_DARK = '#111214';

export const MARK_BOX = 100;

export const PLATE = { cx: 50, cy: 50, r: 34 } as const;
/** The groove that makes the disc read as a weight plate. */
export const RING = { r: 23, width: 3.5 } as const;
export const HOLE = { r: 8 } as const;

/** The bite: a round cut whose inner edge is lined with tooth marks. */
export const BITE = {
  cx: 85.2,
  cy: 20.4,
  r: 15,
  toothRadius: 6,
  teeth: [
    [90.3, 34.5],
    [81.3, 34.9],
    [73.7, 30.0],
    [70.3, 21.7],
    [72.2, 12.9],
  ],
} as const;

/** Crumbs that fly off when the plate is bitten: where they start and how far they fly. */
export const CRUMBS = [
  { cx: 80, cy: 26, r: 2.4, dx: 14, dy: -12 },
  { cx: 84, cy: 32, r: 1.8, dx: 16, dy: 6 },
  { cx: 76, cy: 20, r: 1.6, dx: 4, dy: -16 },
] as const;

/** The circles cut out by the bite: the round cut and each tooth mark. */
export function biteCircles(): { cx: number; cy: number; r: number }[] {
  return [
    { cx: BITE.cx, cy: BITE.cy, r: BITE.r },
    ...BITE.teeth.map(([cx, cy]) => ({ cx, cy, r: BITE.toothRadius })),
  ];
}
