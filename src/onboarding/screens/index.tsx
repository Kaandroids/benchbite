import type { ComponentType } from 'react';

import type { Step } from '../steps';
import { BuildingStep } from './building';
import { ConsentStep } from './consent';
import { GoalStep } from './goal';
import { GoalInsightStep } from './goal-insight';
import { ActivityStep } from './activity';
import { BirthYearStep } from './birth-year';
import { HeightStep } from './height';
import { PaceStep } from './pace';
import { ExperienceStep } from './experience';
import { PlaceholderStep } from './placeholder-step';
import { PlanStep } from './plan';
import { SessionLengthStep } from './session-length';
import { SetupStep } from './setup';
import { TrainingDaysStep } from './training-days';
import { TrainingIntroStep } from './training-intro';
import { SexStep } from './sex';
import { TargetWeightStep } from './target-weight';
import { WeightStep } from './weight';
import { WelcomeStep } from './welcome';

const placeholder =
  (step: Step) =>
  // eslint-disable-next-line react/display-name -- replaced by real screens in #19 and #20
  () => <PlaceholderStep step={step} />;

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
  'training-intro': TrainingIntroStep,
  experience: ExperienceStep,
  'training-days': TrainingDaysStep,
  setup: SetupStep,
  'session-length': SessionLengthStep,
  building: BuildingStep,
  plan: PlanStep,
  reminders: placeholder('reminders'),
  summary: placeholder('summary'),
};
