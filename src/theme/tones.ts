import type { ColorTokens } from './colors';

/**
 * The colours that set answers and rows apart, each with the background its contrast is noted on,
 * so that a colour cannot end up on another's background.
 */
export const TONES = {
  breakfast: { color: 'breakfast', background: 'breakfastBackground' },
  lunch: { color: 'lunch', background: 'lunchBackground' },
  dinner: { color: 'dinner', background: 'dinnerBackground' },
  snack: { color: 'snack', background: 'snackBackground' },
  water: { color: 'water', background: 'waterBackground' },
} as const satisfies Record<string, { color: keyof ColorTokens; background: keyof ColorTokens }>;

export type Tone = keyof typeof TONES;
