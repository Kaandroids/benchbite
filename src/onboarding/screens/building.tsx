import { useTranslation } from 'react-i18next';

import { PACE_RANGES, snapPace, weightGoal } from '@/body/body';
import { Building, BuildingFooter, useBuildingAttempt } from '@/components/building';
import { Screen } from '@/components/ui/screen';
import { useWeekdayFormat } from '@/i18n/dates';
import { paceIn, useNumberFormat } from '@/i18n/units';

import {
  calculateAchievablePace,
  calculateTargets,
  generatePlan,
  type NutritionTargets,
  type WorkoutPlan,
} from '../plan';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type Result = { targets: NutritionTargets; achievablePaceKg: number | null; plan: WorkoutPlan };

/**
 * Calculates the nutrition targets and builds the workout plan while the plate fills up and lines
 * about the plan show one after another. Once done, the plate is bitten and See my plan moves on.
 * A failure offers to try again.
 */
export function BuildingStep() {
  const { t } = useTranslation();
  const { answers, next, bar } = useStep('building');
  const attempt = useBuildingAttempt<Result>();
  const lines = usePlanLines(answers);

  return (
    <Screen
      {...bar}
      footer={
        <BuildingFooter attempt={attempt} label={t('onboarding.building.see')} onPress={next} />
      }
    >
      {/* A new key starts a fresh attempt. */}
      <Building
        key={attempt.key}
        title={t('onboarding.steps.building.title')}
        intro={
          answers.displayName
            ? t('onboarding.building.waitNamed', { name: answers.displayName })
            : t('onboarding.building.wait')
        }
        lines={lines}
        ready={t('onboarding.building.lines.ready')}
        error={t('onboarding.building.error')}
        work={() => build(answers)}
        onDone={attempt.onDone}
        onFail={attempt.onFail}
      />
    </Screen>
  );
}

/** The targets and the plan from the answers, worked out together. */
async function build(answers: OnboardingAnswers): Promise<Result> {
  const [targets, achievablePaceKg, plan] = await Promise.all([
    calculateTargets(answers),
    calculateAchievablePace(answers),
    generatePlan(answers),
  ]);
  return { targets, achievablePaceKg, plan };
}

/** The lines about the plan, from the user's answers: the calories, the exercises, the week. */
function usePlanLines(answers: OnboardingAnswers): string[] {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const weekday = useWeekdayFormat('short');
  const unit = answers.weightUnit ?? 'kg';
  const aim = weightGoal(answers);
  // Read back as the pace step shows it, on the slider's steps, so the line repeats the choice.
  const pace =
    aim &&
    `${format(snapPace(paceIn(unit, aim.paceKg), PACE_RANGES[unit][aim.goal]), {
      maximumFractionDigits: 2,
    })} ${unit}`;
  const days = answers.trainingDays ?? [];
  return [
    aim
      ? t(`onboarding.building.lines.${aim.goal === 'lose_fat' ? 'losing' : 'gaining'}`, { pace })
      : t('onboarding.building.lines.keeping'),
    t(`onboarding.building.lines.exercises.${answers.setup ?? 'gym'}`),
    t('onboarding.building.lines.week', {
      count: days.length,
      days: days.map((day) => weekday(day)).join(', '),
    }),
  ];
}
