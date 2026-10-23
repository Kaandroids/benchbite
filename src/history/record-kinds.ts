// Kept apart from the queries, so that code without the database, such as a workout in progress,
// can use them.

/** The kinds of record, in the order they are shown (ADR 0024). */
export const RECORD_KINDS = [
  'heaviest',
  'one_rep_max',
  'best_set',
  'most_reps',
  'longest_time',
  'most_time',
  'longest_distance',
  'best_pace',
] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];
