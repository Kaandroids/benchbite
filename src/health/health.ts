// What a watch or another app measured, read from Apple Health on iOS and Health Connect on Android
// (#467, ADR 0097). Each platform reads through its own module, platform.ios.ts and
// platform.android.ts, and other platforms read nothing; the rest of the app knows only this file.
export {
  availability as healthAvailability,
  installStore as installHealthStore,
  requestStepsAccess as requestHealthStepsAccess,
  requestWeightAccess as requestHealthWeightAccess,
  requestWorkoutsAccess as requestHealthWorkoutsAccess,
  releaseAccess as releaseHealthAccess,
  requestAccess as requestHealthAccess,
  requestWriteAccess as requestHealthWriteAccess,
  stepsAllowed as healthStepsAllowed,
  stillAllowed as healthStillAllowed,
  store as healthStore,
  weightAllowed as healthWeightAllowed,
  workoutsAllowed as healthWorkoutsAllowed,
} from './platform';
export type {
  HealthAvailability,
  HealthStore,
  StepDay,
  WeightReading,
  WorkoutStats,
} from './types';
