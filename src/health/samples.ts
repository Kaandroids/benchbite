// A workout's heart rate over its time as it is kept (ADR 0104): one value every 10 seconds from the
// start, the average of the store's samples in those seconds, none where it has none.

/** How many seconds one kept value stands for. */
export const SAMPLE_SECONDS = 10;
/** The most values set_workout_health() keeps: a 12-hour workout's. */
const MOST_SAMPLES = 4320;

/** A heart rate the store measured, and when. */
export type HeartRatePoint = { at: Date; bpm: number };

/**
 * The heart rate every 10 seconds between two times, from the store's samples; null when none falls
 * between them.
 */
export function heartRateSamples(
  points: readonly HeartRatePoint[],
  from: Date,
  to: Date,
): (number | null)[] | null {
  const length = Math.min(
    MOST_SAMPLES,
    Math.ceil((to.getTime() - from.getTime()) / 1000 / SAMPLE_SECONDS) + 1,
  );
  const sums = new Array<number>(length).fill(0);
  const counts = new Array<number>(length).fill(0);
  for (const { at, bpm } of points) {
    const index = Math.floor((at.getTime() - from.getTime()) / 1000 / SAMPLE_SECONDS);
    if (index < 0 || index >= length || !Number.isFinite(bpm)) continue;
    sums[index]! += bpm;
    counts[index]! += 1;
  }
  if (!counts.some((count) => count > 0)) return null;
  return sums.map((sum, index) =>
    counts[index] ? Math.round((sum / counts[index]!) * 10) / 10 : null,
  );
}
