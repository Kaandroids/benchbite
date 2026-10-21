// A small catalogue for the tests, with a gym, a dumbbell and a bodyweight candidate where the
// real catalogue has them.
import type { CatalogueEntry, Experience, Metric, Setup, Slot } from './types.ts';

const entry = (
  slot: Slot,
  exerciseId: string,
  requires: Setup,
  priority: number,
  minExperience: Experience = 'beginner',
  metrics: Metric[] = ['weight', 'reps'],
): CatalogueEntry => ({ slot, exerciseId, requires, minExperience, priority, metrics });

export const CATALOGUE: CatalogueEntry[] = [
  entry('squat', 'Barbell_Squat', 'gym', 1),
  entry('squat', 'Goblet_Squat', 'dumbbells', 2),
  entry('squat', 'Front_Squat', 'gym', 3, 'advanced'),
  entry('squat', 'Bodyweight_Squat', 'bodyweight', 4, 'beginner', ['reps']),
  entry('hinge', 'Romanian_Deadlift', 'gym', 1),
  entry('hinge', 'Dumbbell_Deadlift', 'dumbbells', 2),
  entry('hinge', 'Glute_Bridge', 'bodyweight', 3, 'beginner', ['reps']),
  entry('lunge', 'Dumbbell_Lunges', 'dumbbells', 1),
  entry('lunge', 'Walking_Lunge', 'bodyweight', 2, 'beginner', ['reps']),
  entry('horizontal_push', 'Bench_Press', 'gym', 1),
  entry('horizontal_push', 'Floor_Press', 'dumbbells', 2),
  entry('horizontal_push', 'Pushups', 'bodyweight', 3, 'beginner', ['reps']),
  entry('incline_push', 'Incline_Press', 'gym', 1),
  entry('vertical_push', 'Military_Press', 'gym', 1),
  entry('vertical_push', 'Dumbbell_Press', 'dumbbells', 2),
  entry('horizontal_pull', 'Barbell_Row', 'gym', 1),
  entry('horizontal_pull', 'Dumbbell_Row', 'dumbbells', 2),
  entry('horizontal_pull', 'Inverted_Row', 'bodyweight', 3, 'beginner', ['reps']),
  entry('vertical_pull', 'Lat_Pulldown', 'gym', 1),
  entry('vertical_pull', 'Pullover', 'dumbbells', 2),
  entry('biceps', 'Barbell_Curl', 'gym', 1),
  entry('biceps', 'Hammer_Curl', 'dumbbells', 2),
  entry('triceps', 'Pushdown', 'gym', 1),
  entry('triceps', 'Bench_Dips', 'bodyweight', 2, 'beginner', ['reps']),
  entry('shoulders', 'Lateral_Raise', 'dumbbells', 1),
  entry('calves', 'Calf_Raise', 'gym', 1),
  entry('core', 'Plank', 'bodyweight', 1, 'beginner', ['duration']),
  entry('core', 'Crunches', 'bodyweight', 2, 'beginner', ['reps']),
  entry('conditioning', 'Rowing', 'gym', 1, 'beginner', ['distance', 'duration']),
  entry('conditioning', 'Mountain_Climbers', 'bodyweight', 2, 'beginner', ['reps']),
];
