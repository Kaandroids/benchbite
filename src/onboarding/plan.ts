// Calculating and saving the onboarding's result: the nutrition targets, the workout plan and
// the save that completes the onboarding. The rules live on the server (ADR 0009, ADR 0010).
import { toIsoDate } from '@/i18n/dates';
import { isDbError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { targetsFrom, type NutritionTargets } from '@/nutrition/targets';
import type { Plan } from '@shared/plan/types';

import { planRequest, required } from './plan-request';
import type { OnboardingAnswers } from './types';

/** The generate-plan Edge Function's response. */
export type WorkoutPlan = Plan;

export type { NutritionTargets };

/** The answers as the target functions take them. */
function targetArgs(answers: OnboardingAnswers) {
  return {
    sex: required(answers, 'sex'),
    age: new Date().getFullYear() - required(answers, 'birthYear'),
    height_cm: required(answers, 'heightCm'),
    weight_kg: required(answers, 'weightKg'),
    activity_level: required(answers, 'activityLevel'),
    training_days_per_week: required(answers, 'trainingDays').length,
    goal: required(answers, 'goal'),
    target_weight_kg: answers.targetWeightKg,
    weekly_pace_kg: answers.weeklyPaceKg,
  };
}

/**
 * The pace the targets really give for the answers, which the floor may hold below the chosen
 * one (ADR 0054); null for a goal that keeps the weight.
 */
export async function calculateAchievablePace(answers: OnboardingAnswers): Promise<number | null> {
  const { data, error } = await supabase.rpc('achievable_weekly_pace_kg', targetArgs(answers));
  if (error) {
    throw error;
  }
  return data;
}

export async function calculateTargets(answers: OnboardingAnswers): Promise<NutritionTargets> {
  const { data, error } = await supabase.rpc('calculate_nutrition_targets', targetArgs(answers));
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
    body: planRequest(answers),
  });
  if (error || !data) {
    throw error ?? new Error('The plan builder returned nothing');
  }
  return data;
}

/** Answers complete_onboarding refuses, which saving again cannot change. */
const REFUSED = ['tooYoung', 'noConsent', 'daysChanged'] as const;

export type RefusedAnswer = (typeof REFUSED)[number];

/** The answer the server refused to save, or null when saving again may work. */
export function refusedAnswer(error: unknown): RefusedAnswer | null {
  return REFUSED.find((answer) => isDbError(error, answer)) ?? null;
}

/**
 * Saves the onboarding in one transaction (complete_onboarding). Saving again after a save that
 * already went through, for example when the app closed before the next step opened, counts as
 * saved. The answers cannot have changed since, as the steps after the save have no way back.
 */
export async function saveOnboarding(answers: OnboardingAnswers, plan: WorkoutPlan) {
  // The calculated results are sent as the plan, or not at all, never as answers.
  const {
    plan: _plan,
    targets: _targets,
    achievablePaceKg: _achievable,
    reminderMinutes: _reminder,
    ...onlyAnswers
  } = answers;
  // The device's today starts the plan (ADR 0041), as days follow the device.
  const { error } = await supabase.rpc('complete_onboarding', {
    answers: { ...onlyAnswers, today: toIsoDate(new Date()) },
    plan,
  });
  // Saved before, for example by a request whose answer was lost.
  if (error && !isDbError(error, 'onboardingCompleted')) {
    throw error;
  }
}
