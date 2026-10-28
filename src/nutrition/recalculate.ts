import { targetWeightProblem } from '@/body/body';
import { Constants, type Database } from '@/lib/database.types';

import type { TargetAnswers, TargetBasis } from './targets';

type Goal = Database['public']['Enums']['goal_kind'];
type ActivityLevel = Database['public']['Enums']['activity_level'];

/** The steps of working the targets out again, each a screen. */
export type RecalculateStep = 'goal' | 'target' | 'activity' | 'result';

/** Whether a goal changes the weight, and so asks for a target and a pace. */
export const changesWeight = (goal: Goal): goal is 'lose_fat' | 'build_muscle' =>
  goal === 'lose_fat' || goal === 'build_muscle';

/** The steps for a goal: the target and pace only for one that changes the weight. */
export function stepsFor(goal: Goal): RecalculateStep[] {
  return changesWeight(goal)
    ? ['goal', 'target', 'activity', 'result']
    : ['goal', 'activity', 'result'];
}

/** The answers so far, carried from step to step as route parameters. */
export type RecalculateParams = {
  goal?: string;
  target?: string;
  pace?: string;
  activity?: string;
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
 * new weight may have passed the target. Parameters the app did not write are ignored.
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
  if (target !== null) {
    return { goal, targetWeightKg: target, weeklyPaceKg: positive(params.pace), activity };
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
