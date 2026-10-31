// The codes the database raises for requests it refuses (BB001 to BB043 in the migrations, and
// some of Postgres's own), named by what they mean, for the ones the app tells apart.
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
  customFoodDeleted: 'BB025',
  customFoodTotalLimit: 'BB026',
  favouriteLimit: 'BB027',
  recipeLimit: 'BB028',
  recipeTotalLimit: 'BB029',
  recipeDeleted: 'BB030',
  alternativeLimit: 'BB041',
  alternativeInUse: 'BB042',
  alternativeLastOfEmpty: 'BB043',
  // Postgres's own, for a row that is not there, such as an alternative deleted elsewhere.
  notFound: 'P0002',
  // Postgres's own, for a row that would repeat a unique value, such as a food's name.
  uniqueViolation: '23505',
} as const;

type DbError = keyof typeof DB_ERRORS;

/** Whether a failed request was refused by the database with the given error. */
export function isDbError(error: unknown, name: DbError): boolean {
  return (error as { code?: unknown } | null)?.code === DB_ERRORS[name];
}

/**
 * The message for the first of `messages` whose error the database refused a request with, or
 * `fallback` for any other failure.
 */
export function dbErrorMessage(
  error: unknown,
  messages: [DbError, string][],
  fallback: string,
): string {
  return messages.find(([name]) => isDbError(error, name))?.[1] ?? fallback;
}
