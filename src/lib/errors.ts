// The codes the database raises for requests it refuses (BB001 to BB024 in the migrations, and some of Postgres's own), named
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
  closedDay: 'BB020',
  foodArchived: 'BB022',
  customFoodLimit: 'BB024',
  // A unique constraint, such as the name of a food of one's own.
  nameTaken: '23505',
} as const;

type DbError = keyof typeof DB_ERRORS;

/** Whether a failed request was refused by the database with the given error. */
export function isDbError(error: unknown, name: DbError): boolean {
  return (error as { code?: unknown } | null)?.code === DB_ERRORS[name];
}
