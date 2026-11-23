// What the body map draws for an exercise: which parts of the figure its muscles are, which side
// shows them, and where to look when the map is small (ADR 0162).
import type { Slug } from 'react-native-body-highlighter';

import type { Database } from '@/lib/database.types';

type Muscle = Database['public']['Enums']['muscle'];

/**
 * The parts of the drawing each muscle of the library fills. A few are approximations where the
 * figure has no part of its own: abductors show as the glutes, lats and the middle back as the
 * upper back.
 */
const PARTS: Record<Muscle, Slug[]> = {
  abdominals: ['abs', 'obliques'],
  abductors: ['gluteal'],
  adductors: ['adductors'],
  biceps: ['biceps'],
  calves: ['calves'],
  chest: ['chest'],
  forearms: ['forearm'],
  glutes: ['gluteal'],
  hamstrings: ['hamstring'],
  lats: ['upper-back'],
  'lower back': ['lower-back'],
  'middle back': ['upper-back'],
  neck: ['neck'],
  quadriceps: ['quadriceps'],
  shoulders: ['deltoids'],
  traps: ['trapezius'],
  triceps: ['triceps'],
};

/** Every part the figure draws; those no muscle fills make up the rest of the body. */
const ALL_PARTS: Slug[] = [
  'abs',
  'adductors',
  'ankles',
  'biceps',
  'calves',
  'chest',
  'deltoids',
  'feet',
  'forearm',
  'gluteal',
  'hair',
  'hamstring',
  'hands',
  'head',
  'knees',
  'lower-back',
  'neck',
  'obliques',
  'quadriceps',
  'tibialis',
  'trapezius',
  'triceps',
  'upper-back',
];

export type MapSide = 'front' | 'back';
/** The part of the figure a small map shows: the upper body, the thighs and hips, or the calves. */
export type MapZone = 'whole' | 'upper' | 'legs' | 'lower';

/**
 * Each zone as a box of the drawing, [x, y, width, height]. One figure is 724 wide and 1448 high;
 * the back figure is drawn to the right of the front one, and takes the same boxes.
 */
export const ZONES: Record<MapZone, [number, number, number, number]> = {
  whole: [40, 85, 644, 1270],
  upper: [104, 200, 520, 520],
  legs: [114, 600, 500, 500],
  lower: [124, 860, 480, 480],
};

/** Where each muscle is seen best. */
const VIEWS: Record<Muscle, { side: MapSide; zone: MapZone }> = {
  abdominals: { side: 'front', zone: 'upper' },
  abductors: { side: 'back', zone: 'legs' },
  adductors: { side: 'front', zone: 'legs' },
  biceps: { side: 'front', zone: 'upper' },
  calves: { side: 'back', zone: 'lower' },
  chest: { side: 'front', zone: 'upper' },
  forearms: { side: 'front', zone: 'upper' },
  glutes: { side: 'back', zone: 'legs' },
  hamstrings: { side: 'back', zone: 'legs' },
  lats: { side: 'back', zone: 'upper' },
  'lower back': { side: 'back', zone: 'upper' },
  'middle back': { side: 'back', zone: 'upper' },
  neck: { side: 'front', zone: 'upper' },
  quadriceps: { side: 'front', zone: 'legs' },
  shoulders: { side: 'front', zone: 'upper' },
  traps: { side: 'back', zone: 'upper' },
  triceps: { side: 'back', zone: 'upper' },
};

/** The side and the zone a small map shows: where the first muscle the exercise trains is. */
export function viewOf(primary: readonly Muscle[]): { side: MapSide; zone: MapZone } {
  const first = primary[0];
  return first ? VIEWS[first] : { side: 'front', zone: 'whole' };
}

export type MapColors = { primary: string; secondary: string; rest: string };

/**
 * Every part of the figure with its colour: the muscles an exercise trains first, the ones that
 * help, and the rest of the body. A part both lists name is drawn as trained first.
 */
export function mapParts(
  primary: readonly Muscle[],
  secondary: readonly Muscle[],
  colors: MapColors,
): { slug: Slug; color: string }[] {
  const first = new Set(primary.flatMap((muscle) => PARTS[muscle]));
  const helping = new Set(secondary.flatMap((muscle) => PARTS[muscle]));
  return ALL_PARTS.map((slug) => ({
    slug,
    color: first.has(slug) ? colors.primary : helping.has(slug) ? colors.secondary : colors.rest,
  }));
}

/**
 * How to place the figure, drawn `scale` times the library's own size, so that a zone fills a box
 * of the screen: the scale, and where the figure's corner goes, in points.
 */
export function placement(zone: MapZone, width: number, height: number) {
  const [x, y, w, h] = ZONES[zone];
  const pointsPerUnit = Math.min(width / w, height / h);
  return {
    // The library draws a figure 200 points wide at scale 1, over 724 units of its drawing.
    scale: (724 * pointsPerUnit) / 200,
    left: (width - w * pointsPerUnit) / 2 - x * pointsPerUnit,
    top: (height - h * pointsPerUnit) / 2 - y * pointsPerUnit,
  };
}
