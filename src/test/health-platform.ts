// A stand-in for the health store's platform module in tests (src/health/platform.*.ts), whose
// native modules do not load there: a phone without a store, unless a test says otherwise.
import { NO_WORKOUT_STATS } from '@/health/types';

export const store = null;
export const availability = jest.fn(() => Promise.resolve('unavailable'));
export const requestAccess = jest.fn(() => Promise.resolve(false));
export const stillAllowed = jest.fn(() => Promise.resolve(false));
export const releaseAccess = jest.fn(() => Promise.resolve());
export const installStore = jest.fn();
export const workoutStats = jest.fn(() => Promise.resolve(NO_WORKOUT_STATS));
export const weightAllowed = jest.fn(() => Promise.resolve(false));
export const requestWeightAccess = jest.fn(() => Promise.resolve(false));
export const stepsAllowed = jest.fn(() => Promise.resolve(false));
export const requestStepsAccess = jest.fn(() => Promise.resolve(false));
export const dailySteps = jest.fn(() => Promise.resolve([]));
export const weightsSince = jest.fn(() => Promise.resolve([]));
