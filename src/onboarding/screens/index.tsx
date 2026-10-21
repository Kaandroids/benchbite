import type { ComponentType } from 'react';

import type { Step } from '../steps';
import { PlaceholderStep } from './placeholder-step';

const placeholder =
  (step: Step, props: Omit<Parameters<typeof PlaceholderStep>[0], 'step'> = {}) =>
  // eslint-disable-next-line react/display-name -- replaced by real screens step by step
  () => <PlaceholderStep step={step} {...props} />;

/** The screen of every onboarding step. Placeholders are replaced in #16 to #20. */
export const STEP_SCREENS: Record<Step, ComponentType> = {
  welcome: placeholder('welcome'),
  goal: placeholder('goal', { choice: 'goal' }),
  'goal-insight': placeholder('goal-insight'),
  consent: placeholder('consent', { defaults: () => ({ consentedPolicyVersion: 'placeholder' }) }),
  sex: placeholder('sex', { choice: 'sex' }),
  'birth-year': placeholder('birth-year', { defaults: () => ({ birthYear: 1995 }) }),
  height: placeholder('height', { defaults: () => ({ heightCm: 178, heightUnit: 'cm' }) }),
  weight: placeholder('weight', { defaults: () => ({ weightKg: 80, weightUnit: 'kg' }) }),
  'target-weight': placeholder('target-weight', {
    defaults: ({ goal, weightKg = 80 }) => ({
      targetWeightKg: goal === 'lose_fat' ? weightKg - 5 : weightKg + 3,
    }),
  }),
  pace: placeholder('pace', {
    defaults: ({ goal }) => ({ weeklyPaceKg: goal === 'lose_fat' ? 0.5 : 0.25 }),
  }),
  activity: placeholder('activity', { choice: 'activityLevel' }),
  'training-intro': placeholder('training-intro'),
  experience: placeholder('experience', { choice: 'experience' }),
  'training-days': placeholder('training-days', { defaults: () => ({ trainingDays: [1, 3, 5] }) }),
  setup: placeholder('setup', { choice: 'setup' }),
  'session-length': placeholder('session-length', { defaults: () => ({ sessionMinutes: 45 }) }),
  building: placeholder('building'),
  plan: placeholder('plan'),
  reminders: placeholder('reminders'),
  summary: placeholder('summary'),
};
