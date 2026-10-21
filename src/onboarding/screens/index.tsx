import type { ComponentType } from 'react';

import type { Step } from '../steps';
import { ConsentStep } from './consent';
import { GoalStep } from './goal';
import { GoalInsightStep } from './goal-insight';
import { ActivityStep } from './activity';
import { BirthYearStep } from './birth-year';
import { HeightStep } from './height';
import { PaceStep } from './pace';
import { PlaceholderStep } from './placeholder-step';
import { SexStep } from './sex';
import { TargetWeightStep } from './target-weight';
import { WeightStep } from './weight';
import { WelcomeStep } from './welcome';

const placeholder =
  (step: Step, props: Omit<Parameters<typeof PlaceholderStep>[0], 'step'> = {}) =>
  // eslint-disable-next-line react/display-name -- replaced by real screens step by step
  () => <PlaceholderStep step={step} {...props} />;

/** The screen of every onboarding step. Placeholders are replaced in #16 to #20. */
export const STEP_SCREENS: Record<Step, ComponentType> = {
  welcome: WelcomeStep,
  goal: GoalStep,
  'goal-insight': GoalInsightStep,
  consent: ConsentStep,
  sex: SexStep,
  'birth-year': BirthYearStep,
  height: HeightStep,
  weight: WeightStep,
  'target-weight': TargetWeightStep,
  pace: PaceStep,
  activity: ActivityStep,
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
