// The codes the database raises for requests it refuses (BB001 to BB022 in the migrations), named
// by what they mean, for the ones the app tells apart.
const DB_ERRORS = {
  onboardingCompleted: 'BB001',
  tooYoung: 'BB002',
  noConsent: 'BB003',
  daysChanged: 'BB004',
  exerciseLimit: 'BB008',
  workoutLimit: 'BB009',
  logNotFound: 'BB013',
  moveDoesNotFit: 'BB019',
} as const;

type DbError = keyof typeof DB_ERRORS;

/** Whether a failed request was refused by the database with the given error. */
export function isDbError(error: unknown, name: DbError): boolean {
  return (error as { code?: unknown } | null)?.code === DB_ERRORS[name];
}
