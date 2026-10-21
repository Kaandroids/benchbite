import { prescribe, prescribeFinisher, type Prescription } from './prescription.ts';
import { TEMPLATES } from './templates.ts';
import type {
  CatalogueEntry,
  Experience,
  PlanInput,
  PlannedExercise,
  Session,
  SessionType,
  Setup,
  Slot,
  Target,
} from './types.ts';

export const WARM_UP_SECONDS = 5 * 60;
/** Setting up the next exercise: loading a bar, finding a bench. */
const TRANSITION_SECONDS = 60;
const SECONDS_PER_REP = 3;
const MIN_SECONDS_PER_SET = 20;
const MIN_SETS = 2;
/** Sessions this short take one set less of everything, so that more exercises fit. */
const SHORT_SESSION_MINUTES = 30;

// Setups from the most equipment to the least. An exercise is possible when it needs the
// user's setup or less.
const SETUPS: Setup[] = ['gym', 'dumbbells', 'bodyweight'];
const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced'];

function workSeconds(target: Target): number {
  return 'seconds' in target
    ? target.seconds
    : Math.max(MIN_SECONDS_PER_SET, target.reps.max * SECONDS_PER_REP);
}

/** The time an exercise takes: its sets, the rest between them and the move to the next. */
export function exerciseSeconds({ sets, target, restSeconds }: Prescription): number {
  return sets * workSeconds(target) + (sets - 1) * restSeconds + TRANSITION_SECONDS;
}

/** The candidates for a slot that the user's setup and experience allow, in order. */
export function candidatesFor(
  catalogue: CatalogueEntry[],
  slot: Slot,
  setup: Setup,
  experience: Experience,
): CatalogueEntry[] {
  return catalogue
    .filter(
      (entry) =>
        entry.slot === slot &&
        SETUPS.indexOf(entry.requires) >= SETUPS.indexOf(setup) &&
        EXPERIENCES.indexOf(entry.minExperience) <= EXPERIENCES.indexOf(experience),
    )
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Picks a candidate for the slot that is not yet in the session. A repeated session type takes
 * the next candidate, so that a second push day does not repeat the first one.
 */
function pick(
  candidates: CatalogueEntry[],
  variant: number,
  used: Set<string>,
): CatalogueEntry | undefined {
  const unused = candidates.filter((entry) => !used.has(entry.exerciseId));
  return unused.length === 0 ? undefined : unused[variant % unused.length];
}

function planned(entry: CatalogueEntry, prescription: Prescription): PlannedExercise {
  return { exerciseId: entry.exerciseId, slot: entry.slot, ...prescription };
}

/** Minutes of conditioning at the end of a fat loss session. */
export function finisherMinutes(input: PlanInput): number {
  if (input.goal !== 'lose_fat') {
    return 0;
  }
  return input.sessionMinutes >= 60 ? 10 : 5;
}

/**
 * Builds one session. Slots are filled in order of importance while time is left; a slot that
 * does not fit is tried with fewer sets, down to two, and left out if it still does not fit.
 */
export function buildSession(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  weekday: number,
  type: SessionType,
  variant: number,
): Session {
  const budget = input.sessionMinutes * 60;
  let seconds = WARM_UP_SECONDS;

  let finisher: PlannedExercise | null = null;
  const conditioningMinutes = finisherMinutes(input);
  if (conditioningMinutes > 0) {
    const entry = pick(
      candidatesFor(catalogue, 'conditioning', input.setup, input.experience),
      variant,
      new Set(),
    );
    if (entry) {
      const prescription = prescribeFinisher(entry.metrics, conditioningMinutes);
      finisher = planned(entry, prescription);
      seconds += exerciseSeconds(prescription);
    }
  }

  const exercises: PlannedExercise[] = [];
  const used = new Set<string>();
  for (const { slot, role } of TEMPLATES[type]) {
    const entry = pick(
      candidatesFor(catalogue, slot, input.setup, input.experience),
      variant,
      used,
    );
    if (!entry) {
      continue;
    }
    const prescribed = prescribe(input.goal, input.experience, role, entry.metrics);
    if (input.sessionMinutes <= SHORT_SESSION_MINUTES) {
      prescribed.sets = Math.max(MIN_SETS, prescribed.sets - 1);
    }
    const prescription = fit(prescribed, budget - seconds);
    if (prescription) {
      exercises.push(planned(entry, prescription));
      used.add(entry.exerciseId);
      seconds += exerciseSeconds(prescription);
    }
  }

  return {
    weekday,
    type,
    variant,
    exercises,
    finisher,
    estimatedMinutes: Math.ceil(seconds / 60),
  };
}

/** The prescription with as many of its sets as fit into the time left, or none below two. */
function fit(prescription: Prescription, secondsLeft: number): Prescription | undefined {
  for (let sets = prescription.sets; sets >= MIN_SETS; sets--) {
    const candidate = { ...prescription, sets };
    if (exerciseSeconds(candidate) <= secondsLeft) {
      return candidate;
    }
  }
  return undefined;
}
