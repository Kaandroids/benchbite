/** Where an exercise's details open, over the workout in progress when `inSession`. */
export const exerciseDetailsRoute = (id: string, inSession = false) =>
  ({
    pathname: inSession ? '/session/exercise/[id]' : '/workout/exercise/[id]',
    params: { id },
  }) as const;

/** Where an exercise's records and progress open, over the workout in progress when `inSession`. */
export const exerciseHistoryRoute = (id: string, inSession = false) =>
  ({
    pathname: inSession ? '/session/exercise/history' : '/workout/exercise/history',
    params: { id },
  }) as const;
