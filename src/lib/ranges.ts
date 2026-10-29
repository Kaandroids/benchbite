/** How far back a chart of the Progress tab reaches (ADR 0047). */
export type ProgressRange = 'month' | 'threeMonths' | 'sixMonths' | 'year';

export const PROGRESS_RANGES: readonly ProgressRange[] = [
  'month',
  'threeMonths',
  'sixMonths',
  'year',
];

const RANGE_MONTHS: Record<ProgressRange, number> = {
  month: 1,
  threeMonths: 3,
  sixMonths: 6,
  year: 12,
};

/** The first day of a range that ends on `today`: the same day months back, or that month's last. */
export function rangeStart(range: ProgressRange, today: Date): Date {
  const month = today.getMonth() - RANGE_MONTHS[range];
  const lastDay = new Date(today.getFullYear(), month + 1, 0).getDate();
  return new Date(today.getFullYear(), month, Math.min(today.getDate(), lastDay));
}
