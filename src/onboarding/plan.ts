// Calculating and saving the onboarding's result: the nutrition targets, the workout plan and
// the save that completes the onboarding. The rules live on the server (ADR 0009, ADR 0010).
import { supabase } from '@/lib/supabase';
import { targetsFrom, type NutritionTargets } from '@/nutrition/targets';
import type { Plan } from '@shared/plan/types';

import type { OnboardingAnswers } from './types';

/** The generate-plan Edge Function's response. */
export type WorkoutPlan = Plan;

export type { NutritionTargets };

/** Answers the result needs; the steps before guarantee them. */
function required<K extends keyof OnboardingAnswers>(answers: OnboardingAnswers, key: K) {
  const value = answers[key];
  if (value === undefined) {
    throw new Error(`The onboarding answer ${key} is missing`);
  }
  return value as NonNullable<OnboardingAnswers[K]>;
}

export async function calculateTargets(answers: OnboardingAnswers): Promise<NutritionTargets> {
  const { data, error } = await supabase.rpc('calculate_nutrition_targets', {
    sex: required(answers, 'sex'),
    age: new Date().getFullYear() - required(answers, 'birthYear'),
    height_cm: required(answers, 'heightCm'),
    weight_kg: required(answers, 'weightKg'),
    activity_level: required(answers, 'activityLevel'),
    training_days_per_week: required(answers, 'trainingDays').length,
    goal: required(answers, 'goal'),
    target_weight_kg: answers.targetWeightKg,
    weekly_pace_kg: answers.weeklyPaceKg,
  });
  if (error) {
    throw error;
  }
  const targets = targetsFrom(data);
  if (!targets) {
    throw new Error('The nutrition targets could not be calculated');
  }
  return targets;
}

export async function generatePlan(answers: OnboardingAnswers): Promise<WorkoutPlan> {
  const { data, error } = await supabase.functions.invoke<WorkoutPlan>('generate-plan', {
    body: {
      goal: required(answers, 'goal'),
      experience: required(answers, 'experience'),
      trainingDays: required(answers, 'trainingDays'),
      setup: required(answers, 'setup'),
      sessionMinutes: required(answers, 'sessionMinutes'),
    },
  });
  if (error || !data) {
    throw error ?? new Error('The plan builder returned nothing');
  }
  return data;
}

/** The SQLSTATE complete_onboarding raises when the onboarding was saved before. */
const ALREADY_COMPLETED = 'BB001';

/** Answers complete_onboarding refuses by their SQLSTATE, which saving again cannot change. */
const REFUSED = { BB002: 'tooYoung', BB003: 'noConsent', BB004: 'daysChanged' } as const;

export type RefusedAnswer = (typeof REFUSED)[keyof typeof REFUSED];

/** The answer the server refused to save, or null when saving again may work. */
export function refusedAnswer(error: unknown): RefusedAnswer | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && code in REFUSED ? REFUSED[code as keyof typeof REFUSED] : null;
}

/**
 * Saves the onboarding in one transaction (complete_onboarding). Saving again after a save that
 * already went through, for example when the app closed before the next step opened, counts as
 * saved. The answers cannot have changed since, as the steps after the save have no way back.
 */
export async function saveOnboarding(answers: OnboardingAnswers, plan: WorkoutPlan) {
  // The calculated result is sent as the plan, not again as an answer.
  const { plan: _plan, targets: _targets, reminderMinutes: _reminder, ...onlyAnswers } = answers;
  const { error } = await supabase.rpc('complete_onboarding', { answers: onlyAnswers, plan });
  if (error && error.code !== ALREADY_COMPLETED) {
    throw error;
  }
}
