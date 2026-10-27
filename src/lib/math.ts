/** The whole numbers from `from` to `to`, both included. */
export function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/** The value, moved into the range from `min` to `max` if it lies outside. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A typed number, with a point or a comma as the decimal separator; null when it is none. */
export function parseDecimal(text: string): number | null {
  const value = Number(text.trim().replace(',', '.'));
  return text.trim() && Number.isFinite(value) ? value : null;
}
