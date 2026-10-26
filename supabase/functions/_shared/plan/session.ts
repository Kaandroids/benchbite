import { Constants } from '../database.types.ts';
import { PLAN_WORKOUT_EXERCISES } from './limits.ts';
import { prescribe, prescribeConditioning, type Prescription } from './prescription.ts';
import { TEMPLATES } from './templates.ts';
import type {
  CatalogueEntry,
  Experience,
  PlanInput,
  PlannedExercise,
  Role,
  Session,
  SessionType,
  Setup,
  Slot,
  Target,
} from './types.ts';

// save_workout() estimates hand-made workouts with the same times (ADR 0017); change both.
export const WARM_UP_SECONDS = 5 * 60;
/** Setting up the next exercise: loading a bar, finding a bench. */
const TRANSITION_SECONDS = 60;
const SECONDS_PER_REP = 3;
const MIN_SECONDS_PER_SET = 20;
const MIN_SETS = 2;
/** The sets an exercise may gain when the session has time left: one more than prescribed. */
const EXTRA_SETS = 1;
/** Sessions this short take one set less of everything, so that more exercises fit. */
const SHORT_SESSION_MINUTES = 30;

// The database enums are ordered: setups from the most equipment to the least, experience from
// beginner to advanced. An exercise is possible when it needs the user's setup or less, and the
// user's experience or less.
const SETUPS: readonly Setup[] = Constants.public.Enums.training_setup;
const EXPERIENCES: readonly Experience[] = Constants.public.Enums.experience;

function workSeconds(target: Target): number {
  return 'seconds' in target
    ? target.seconds
    : Math.max(MIN_SECONDS_PER_SET, target.reps.max * SECONDS_PER_REP);
}

/** The rest between an exercise's sets. */
function restBetweenSets({ sets, restSeconds }: Prescription): number {
  return (sets - 1) * restSeconds;
}

/** The time an exercise takes: its sets, the rest between them and the move to the next. */
export function exerciseSeconds(prescription: Prescription): number {
  const { sets, target } = prescription;
  return sets * workSeconds(target) + restBetweenSets(prescription) + TRANSITION_SECONDS;
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
 * How often each slot was already filled this week. A slot that comes back takes the next
 * candidate, so that a squat on Tuesday and another on Friday are different exercises.
 */
export type SlotUses = Map<Slot, number>;

/** Picks the slot's next candidate for this week that is not yet in the session. */
function pick(
  candidates: CatalogueEntry[],
  slotUses: SlotUses,
  used: Set<string>,
): CatalogueEntry | undefined {
  const unused = candidates.filter((entry) => !used.has(entry.exerciseId));
  if (unused.length === 0) {
    return undefined;
  }
  return unused[(slotUses.get(unused[0]!.slot) ?? 0) % unused.length];
}

/** Counts a slot as filled once its exercise is in the session. */
function countUse(slotUses: SlotUses, slot: Slot) {
  slotUses.set(slot, (slotUses.get(slot) ?? 0) + 1);
}

function planned(entry: CatalogueEntry, prescription: Prescription): PlannedExercise {
  return { exerciseId: entry.exerciseId, slot: entry.slot, ...prescription };
}

/** Minutes of conditioning at the end of a fat loss session. */
export function conditioningMinutes(input: PlanInput): number {
  if (input.goal !== 'lose_fat') {
    return 0;
  }
  return input.sessionMinutes >= 60 ? 10 : 5;
}

/** The conditioning block at the end of a fat loss session, if the setup allows one. */
function buildConditioning(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  slotUses: SlotUses,
): PlannedExercise | null {
  const minutes = conditioningMinutes(input);
  if (minutes === 0) {
    return null;
  }
  const entry = pick(
    candidatesFor(catalogue, 'conditioning', input.setup, input.experience),
    slotUses,
    new Set(),
  );
  if (!entry) {
    return null;
  }
  countUse(slotUses, entry.slot);
  return planned(entry, prescribeConditioning(entry.metrics, minutes));
}

type Chosen = { exercise: PlannedExercise; role: Role; maxSets: number };

/**
 * The session's exercises within the seconds left, in three rounds:
 *
 * 1. The template's slots in order of importance. A slot that does not fit is tried with fewer
 *    sets, down to two. If it still does not fit, it and every slot after it are left out, so a
 *    less important exercise never replaces a more important one.
 * 2. With time left, each exercise in order gains a set, up to one more than prescribed.
 * 3. With time still left, the slots in order take another of their exercises, as accessories,
 *    for as long as one fits and the workout stays within what the onboarding saves.
 *
 * Slots without a possible exercise for the setup are skipped. `room` is how many exercises the
 * session may have besides the conditioning.
 */
function buildExercises(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  type: SessionType,
  slotUses: SlotUses,
  secondsLeft: number,
  room: number,
): Chosen[] {
  const chosen: Chosen[] = [];
  const used = new Set<string>();
  let left = secondsLeft;
  const candidates = (slot: Slot) => candidatesFor(catalogue, slot, input.setup, input.experience);
  const prescribed = (role: Role, entry: CatalogueEntry) => {
    const prescription = prescribe(input.goal, input.experience, role, entry.metrics);
    if (input.sessionMinutes <= SHORT_SESSION_MINUTES) {
      prescription.sets = Math.max(MIN_SETS, prescription.sets - 1);
    }
    return prescription;
  };
  const add = (entry: CatalogueEntry, role: Role, prescription: Prescription) => {
    chosen.push({ exercise: planned(entry, prescription), role, maxSets: prescription.sets });
    used.add(entry.exerciseId);
    countUse(slotUses, entry.slot);
    left -= exerciseSeconds(prescription);
  };

  let timeRanOut = false;
  for (const { slot, role } of TEMPLATES[type]) {
    const entry = pick(candidates(slot), slotUses, used);
    if (!entry) {
      continue;
    }
    const prescription = fit(prescribed(role, entry), left);
    if (!prescription || chosen.length >= room) {
      timeRanOut = true;
      break;
    }
    add(entry, role, prescription);
  }

  for (const item of chosen) {
    const more = { ...item.exercise, sets: item.maxSets + EXTRA_SETS };
    const extra = exerciseSeconds(more) - exerciseSeconds(item.exercise);
    if (item.exercise.sets === item.maxSets && extra <= left) {
      item.exercise = more;
      left -= extra;
    }
  }

  // Each round adds at most one more exercise for each slot: the first one not in the session
  // yet, so that a gym keeps to its own equipment as long as it can.
  for (let added = !timeRanOut; added;) {
    added = false;
    for (const { slot } of TEMPLATES[type]) {
      const entry =
        chosen.length < room
          ? candidates(slot).find((candidate) => !used.has(candidate.exerciseId))
          : undefined;
      const prescription = entry && fit(prescribed('accessory', entry), left);
      if (entry && prescription) {
        add(entry, 'accessory', prescription);
        added = true;
      }
    }
  }
  return chosen;
}

/**
 * Builds one session: the warm-up, then as many of the exercises as fit into the time that is
 * left after the conditioning for fat loss, which comes last as an ordinary exercise.
 */
export function buildSession(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  weekdays: number[],
  type: SessionType,
  slotUses: SlotUses,
): Session {
  const conditioning = buildConditioning(input, catalogue, slotUses);
  const fixedSeconds = WARM_UP_SECONDS + (conditioning ? exerciseSeconds(conditioning) : 0);
  const chosen = buildExercises(
    input,
    catalogue,
    type,
    slotUses,
    input.sessionMinutes * 60 - fixedSeconds,
    PLAN_WORKOUT_EXERCISES - (conditioning ? 1 : 0),
  );
  const secondsOf = (role: Role) =>
    chosen
      .filter((item) => item.role === role)
      .reduce((total, item) => total + exerciseSeconds(item.exercise), 0);
  const time = {
    warmUp: WARM_UP_SECONDS,
    main: secondsOf('main'),
    extras: secondsOf('accessory'),
    conditioning: conditioning ? exerciseSeconds(conditioning) : 0,
  };
  const exercises = chosen.map((item) => item.exercise);
  const seconds = time.warmUp + time.main + time.extras + time.conditioning;
  // The lifting, without the conditioning, whose sets are rounds of a circuit.
  const work = {
    exercises: exercises.length,
    sets: exercises.reduce((total, exercise) => total + exercise.sets, 0),
    rest: exercises.reduce((total, exercise) => total + restBetweenSets(exercise), 0),
  };
  return {
    weekdays,
    type,
    exercises: conditioning ? [...exercises, conditioning] : exercises,
    estimatedMinutes: Math.ceil(seconds / 60),
    time,
    work,
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
