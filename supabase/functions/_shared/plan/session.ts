import { Constants } from '../database.types.ts';
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
export function finisherMinutes(input: PlanInput): number {
  if (input.goal !== 'lose_fat') {
    return 0;
  }
  return input.sessionMinutes >= 60 ? 10 : 5;
}

/** The conditioning block at the end of a fat loss session, if the setup allows one. */
function buildFinisher(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  slotUses: SlotUses,
): PlannedExercise | null {
  const minutes = finisherMinutes(input);
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
  return planned(entry, prescribeFinisher(entry.metrics, minutes));
}

/**
 * The session's exercises within the seconds left. Slots are filled in order of importance; a
 * slot that does not fit is tried with fewer sets, down to two. If it still does not fit, it and
 * every slot after it are left out, so a less important exercise never replaces a more important
 * one. Slots without a possible exercise for the setup are skipped.
 */
function buildExercises(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  type: SessionType,
  slotUses: SlotUses,
  secondsLeft: number,
): PlannedExercise[] {
  const exercises: PlannedExercise[] = [];
  const used = new Set<string>();
  let left = secondsLeft;
  for (const { slot, role } of TEMPLATES[type]) {
    const entry = pick(
      candidatesFor(catalogue, slot, input.setup, input.experience),
      slotUses,
      used,
    );
    if (!entry) {
      continue;
    }
    const prescribed = prescribe(input.goal, input.experience, role, entry.metrics);
    if (input.sessionMinutes <= SHORT_SESSION_MINUTES) {
      prescribed.sets = Math.max(MIN_SETS, prescribed.sets - 1);
    }
    const prescription = fit(prescribed, left);
    if (!prescription) {
      break;
    }
    exercises.push(planned(entry, prescription));
    used.add(entry.exerciseId);
    countUse(slotUses, slot);
    left -= exerciseSeconds(prescription);
  }
  return exercises;
}

/**
 * Builds one session: the warm-up, the finisher for fat loss, then as many of the exercises as
 * fit into the time that is left.
 */
export function buildSession(
  input: PlanInput,
  catalogue: CatalogueEntry[],
  weekday: number,
  type: SessionType,
  slotUses: SlotUses,
): Session {
  const finisher = buildFinisher(input, catalogue, slotUses);
  const fixedSeconds = WARM_UP_SECONDS + (finisher ? exerciseSeconds(finisher) : 0);
  const exercises = buildExercises(
    input,
    catalogue,
    type,
    slotUses,
    input.sessionMinutes * 60 - fixedSeconds,
  );
  const seconds = exercises.reduce((total, e) => total + exerciseSeconds(e), fixedSeconds);
  return {
    weekday,
    type,
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
