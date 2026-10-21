import type { Experience, Goal, Metric, Role, Target } from './types.ts';

export type Prescription = { sets: number; target: Target; restSeconds: number };

type Scheme = { reps: [number, number]; restSeconds: number };

// Strength uses heavy weights for few reps with long rests; fat loss and general health use
// lighter weights for more reps with short rests.
const SCHEMES: Record<Goal, Record<Role, Scheme>> = {
  get_stronger: {
    main: { reps: [4, 6], restSeconds: 180 },
    accessory: { reps: [8, 10], restSeconds: 90 },
  },
  build_muscle: {
    main: { reps: [6, 10], restSeconds: 120 },
    accessory: { reps: [10, 15], restSeconds: 75 },
  },
  lose_fat: {
    main: { reps: [8, 12], restSeconds: 75 },
    accessory: { reps: [12, 15], restSeconds: 60 },
  },
  stay_healthy: {
    main: { reps: [8, 12], restSeconds: 90 },
    accessory: { reps: [12, 15], restSeconds: 60 },
  },
};

// More experienced people recover from, and need, more sets.
const SETS: Record<Experience, Record<Role, number>> = {
  beginner: { main: 3, accessory: 2 },
  intermediate: { main: 4, accessory: 3 },
  advanced: { main: 4, accessory: 3 },
};

// Holds such as planks grow with experience.
const HOLD_SECONDS: Record<Experience, number> = { beginner: 30, intermediate: 45, advanced: 60 };
const HOLD_REST_SECONDS = 45;

/**
 * Sets, a rep or time target and the rest between sets. Exercises that record reps get a rep
 * range; exercises that only record duration, such as planks, get a time.
 */
export function prescribe(
  goal: Goal,
  experience: Experience,
  role: Role,
  metrics: Metric[],
): Prescription {
  const sets =
    SETS[experience][role] +
    (goal === 'get_stronger' && experience === 'advanced' && role === 'main' ? 1 : 0);
  if (!metrics.includes('reps') && metrics.includes('duration')) {
    return { sets, target: { seconds: HOLD_SECONDS[experience] }, restSeconds: HOLD_REST_SECONDS };
  }
  const { reps, restSeconds } = SCHEMES[goal][role];
  return { sets, target: { reps: { min: reps[0], max: reps[1] } }, restSeconds };
}

/**
 * A conditioning finisher: steady work on a cardio machine for the given minutes, or rounds of
 * a bodyweight exercise that take about a minute each, including a short rest. One minute is
 * left for getting set up.
 */
export function prescribeFinisher(metrics: Metric[], minutes: number): Prescription {
  if (metrics.includes('duration')) {
    return { sets: 1, target: { seconds: minutes * 60 }, restSeconds: 0 };
  }
  return { sets: minutes - 1, target: { reps: { min: 10, max: 15 } }, restSeconds: 15 };
}
