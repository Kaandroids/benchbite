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
import { PlanStep } from './plan';
import { RemindersStep } from './reminders';
import { SessionLengthStep } from './session-length';
import { SetupStep } from './setup';
import { TrainingDaysStep } from './training-days';
import { TrainingIntroStep } from './training-intro';
import { SexStep } from './sex';
import { SummaryStep } from './summary';
import { TargetWeightStep } from './target-weight';
import { WeightStep } from './weight';
import { WelcomeStep } from './welcome';

/** The screen of every onboarding step. */
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
  reminders: RemindersStep,
  summary: SummaryStep,
};
