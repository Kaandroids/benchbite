// Calculating and saving the onboarding's result: the nutrition targets, the workout plan and
// the save that completes the onboarding. The rules live on the server (ADR 0009, ADR 0010).
import { supabase } from '@/lib/supabase';

import type { OnboardingAnswers } from './types';

type SessionType = 'full_body' | 'upper' | 'lower' | 'push' | 'pull' | 'legs';

export type PlannedExercise = {
  exerciseId: string;
  slot: string;
  sets: number;
  target: { reps: { min: number; max: number } } | { seconds: number };
  restSeconds: number;
};

/** The generate-plan Edge Function's response. */
export type WorkoutPlan = {
  sessions: {
    weekday: number;
    type: SessionType;
    exercises: PlannedExercise[];
    finisher: PlannedExercise | null;
    estimatedMinutes: number;
  }[];
};

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

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
  return {
    calories: data.calories ?? 0,
    proteinG: data.protein_g ?? 0,
    carbsG: data.carbs_g ?? 0,
    fatG: data.fat_g ?? 0,
  };
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

/**
 * Saves the onboarding in one transaction (complete_onboarding). Saving again after a save that
 * already went through, for example after going back from the next step, counts as saved.
 */
/** The SQLSTATE complete_onboarding raises when the onboarding was saved before. */
const ALREADY_COMPLETED = 'BB001';

export async function saveOnboarding(answers: OnboardingAnswers, plan: WorkoutPlan) {
  // The calculated result is sent as the plan, not again as an answer.
  const { plan: _plan, targets: _targets, reminderMinutes: _reminder, ...onlyAnswers } = answers;
  const { error } = await supabase.rpc('complete_onboarding', { answers: onlyAnswers, plan });
  if (error && error.code !== ALREADY_COMPLETED) {
    throw error;
  }
}
