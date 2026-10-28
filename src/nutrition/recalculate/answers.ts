import {
  changesWeight,
  isPaceInRange,
  targetWeightProblem,
  type ActivityLevel,
  type Goal,
} from '@/body/body';
import { toTenth } from '@/i18n/units';
import { Constants } from '@/lib/database.types';

import type { NutritionTargets, TargetAnswers, TargetBasis } from '../targets';

/** The steps of working the targets out again, each a screen. */
export type RecalculateStep = 'goal' | 'target' | 'activity' | 'review';

/** Every page of the route: the steps, the save, and the page after saving. */
export type RecalculateRoute = RecalculateStep | 'building' | 'done';

/** The steps for a goal: the target and pace only for one that changes the weight. */
export function stepsFor(goal: Goal): RecalculateStep[] {
  return changesWeight(goal)
    ? ['goal', 'target', 'activity', 'review']
    : ['goal', 'activity', 'review'];
}

/** The answers so far, carried from step to step as route parameters. */
export type RecalculateParams = {
  goal?: string;
  target?: string;
  pace?: string;
  activity?: string;
  /** On the save and the page after it: the targets in use before, as `calories,protein,carbs,fat`. */
  was?: string;
  /** On the save: the key the review opened it with. */
  save?: string;
};

const oneOf = <T extends string>(options: readonly T[], value: string | undefined) =>
  options.find((option) => option === value);

const positive = (value: string | undefined) => {
  const number = Number(value);
  return value !== undefined && Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * The answers from the route parameters, and the saved ones for what is not answered yet. The
 * saved target and pace carry over only to the same goal, and only while they still suit it; a
 * new weight may have passed the target. Parameters the app did not write, or a target the target
 * step would refuse, are ignored.
 */
export function answersFrom(
  params: RecalculateParams,
  basis: TargetBasis,
  weightKg: number,
): TargetAnswers {
  const goal = oneOf(Constants.public.Enums.goal_kind, params.goal) ?? basis.goal;
  const activity =
    oneOf<ActivityLevel>(Constants.public.Enums.activity_level, params.activity) ?? basis.activity;
  if (!changesWeight(goal)) {
    return { goal, targetWeightKg: null, weeklyPaceKg: null, activity };
  }
  const target = positive(params.target);
  const pace = positive(params.pace);
  // Checked as the target step checks them, so a link cannot skip to saving what it refuses.
  if (
    target !== null &&
    pace !== null &&
    targetWeightProblem(goal, weightKg, target, basis.heightCm) === null &&
    (isPaceInRange('kg', goal, pace) || isPaceInRange('lb', goal, pace))
  ) {
    return { goal, targetWeightKg: target, weeklyPaceKg: pace, activity };
  }
  const keepsSaved =
    goal === basis.goal &&
    basis.targetWeightKg !== null &&
    targetWeightProblem(goal, weightKg, basis.targetWeightKg, basis.heightCm) === null;
  return keepsSaved
    ? { goal, targetWeightKg: basis.targetWeightKg, weeklyPaceKg: basis.weeklyPaceKg, activity }
    : { goal, targetWeightKg: null, weeklyPaceKg: null, activity };
}

/** The route parameters of the answers, for the next step. */
export function paramsOf(answers: TargetAnswers): RecalculateParams {
  return {
    goal: answers.goal,
    activity: answers.activity,
    ...(answers.targetWeightKg !== null ? { target: String(answers.targetWeightKg) } : {}),
    ...(answers.weeklyPaceKg !== null ? { pace: String(answers.weeklyPaceKg) } : {}),
  };
}

/** One answer that differs from the saved one: its old value, null when there was none. */
export type AnswerChange =
  | { key: 'goal'; from: Goal; to: Goal }
  | { key: 'target' | 'pace'; from: number | null; to: number }
  | { key: 'activity'; from: ActivityLevel; to: ActivityLevel };

/**
 * The answers that differ from the saved ones, compared as they are stored. A target and pace
 * dropped with a goal that keeps the weight are not listed: the goal says it.
 */
export function answerChanges(basis: TargetBasis, answers: TargetAnswers): AnswerChange[] {
  const changes: AnswerChange[] = [];
  if (answers.goal !== basis.goal) {
    changes.push({ key: 'goal', from: basis.goal, to: answers.goal });
  }
  const differs = (from: number | null, to: number, round: (value: number) => number) =>
    from === null || round(from) !== round(to);
  if (
    answers.targetWeightKg !== null &&
    differs(basis.targetWeightKg, answers.targetWeightKg, toTenth)
  ) {
    changes.push({ key: 'target', from: basis.targetWeightKg, to: answers.targetWeightKg });
  }
  const toHundredth = (value: number) => Math.round(value * 100);
  if (
    answers.weeklyPaceKg !== null &&
    differs(basis.weeklyPaceKg, answers.weeklyPaceKg, toHundredth)
  ) {
    changes.push({ key: 'pace', from: basis.weeklyPaceKg, to: answers.weeklyPaceKg });
  }
  if (answers.activity !== basis.activity) {
    changes.push({ key: 'activity', from: basis.activity, to: answers.activity });
  }
  return changes;
}

/** The targets in use before saving, for the page after it. */
export function wasParam(targets: NutritionTargets): string {
  return [targets.calories, targets.proteinG, targets.carbsG, targets.fatG].join(',');
}

/** The targets in use before saving, or null for a parameter the app did not write. */
export function targetsFromWas(was: string | undefined): NutritionTargets | null {
  const values = (was ?? '').split(',').map(Number);
  if (values.length !== 4 || !values.every((value) => Number.isInteger(value) && value >= 0)) {
    return null;
  }
  const [calories, proteinG, carbsG, fatG] = values as [number, number, number, number];
  return { calories, proteinG, carbsG, fatG };
}
