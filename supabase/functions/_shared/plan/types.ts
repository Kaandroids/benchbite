// Types of the plan builder. They mirror the database enums, so that the rules can be tested
// without a database.
import type { Database } from '../database.types.ts';
import type { SessionMinutes } from './limits.ts';

type Enums = Database['public']['Enums'];

export type Goal = Enums['goal_kind'];
export type Experience = Enums['experience'];
export type Setup = Enums['training_setup'];
export type Slot = Enums['plan_slot'];
export type Metric = Enums['exercise_metric'];

export type PlanInput = {
  goal: Goal;
  experience: Experience;
  /** ISO weekdays, 1 for Monday to 7 for Sunday, at most six. */
  trainingDays: number[];
  setup: Setup;
  sessionMinutes: SessionMinutes;
};

/** One row of the plan slot catalogue, with the metrics of its exercise. */
export type CatalogueEntry = {
  slot: Slot;
  exerciseId: string;
  requires: Setup;
  minExperience: Experience;
  priority: number;
  metrics: Metric[];
};

export type SessionType = Enums['plan_session_type'];

/** Main exercises come first and get the heavier prescription. */
export type Role = 'main' | 'accessory';

export type Target = { reps: { min: number; max: number } } | { seconds: number };

export type PlannedExercise = {
  exerciseId: string;
  slot: Slot;
  sets: number;
  target: Target;
  restSeconds: number;
};

export type Session = {
  weekday: number;
  type: SessionType;
  exercises: PlannedExercise[];
  /** A short conditioning block at the end, for fat loss. */
  finisher: PlannedExercise | null;
  estimatedMinutes: number;
};

export type Plan = { sessions: Session[] };
