import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler } from 'react-native';

import { weightGoal } from '@/body/body';
import { Building, BuildingFooter, useBuildingAttempt } from '@/components/building';
import { Screen } from '@/components/ui/screen';
import { paceIn, useNumberFormat, useWeightLabel, type WeightUnit } from '@/i18n/units';

import { useRecalculateTargets, type TargetAnswers } from '../targets';
import { paramsOf } from './answers';
import { type StepProps } from './step';

/** The saves the review opened, by their key, so that a link cannot start one by itself. */
const opened = new Set<string>();

/** Opens the save of the answers, from the review. */
export function openSave(answers: TargetAnswers, was: string) {
  const save = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  opened.add(save);
  router.push({
    pathname: '/nutrition/recalculate/[step]',
    params: { step: 'building', ...paramsOf(answers), was, save },
  });
}

/** Whether the review opened the save with this key. */
export function wasOpened(save: string | undefined): boolean {
  return save !== undefined && opened.has(save);
}

type BuildingStepProps = Pick<StepProps, 'answers' | 'weightKg' | 'unit'> & {
  /** The targets in use before, handed on to the page with the new ones. */
  was: string | undefined;
};

/**
 * Saves the new answers while the onboarding's plate fills up and lines about the goals show one
 * after another. Once saved, See my goals opens the new goals. It cannot be left while saving, so
 * that the save is not left half seen; a failure offers to try again or go back.
 */
export function BuildingStep({ answers, weightKg, unit, was }: BuildingStepProps) {
  const { t } = useTranslation();
  const recalculate = useRecalculateTargets();
  const lines = useGoalLines(answers, weightKg, unit);
  const attempt = useBuildingAttempt<void>();
  const { working } = attempt;

  // The swipe back is turned off below; this stops Android's back button.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => working);
      return () => subscription.remove();
    }, [working]),
  );

  const see = () => {
    // The steps close under the page with the new goals, so going back from it leaves.
    router.dismissTo('/nutrition/goals');
    router.push({ pathname: '/nutrition/recalculate/[step]', params: { step: 'done', was } });
  };

  return (
    <Screen
      onBack={attempt.failed ? () => router.back() : undefined}
      footer={
        <BuildingFooter
          attempt={attempt}
          label={t('nutrition.recalculate.building.see')}
          onPress={see}
        />
      }
    >
      <Stack.Screen options={{ gestureEnabled: !working }} />
      {/* A new key starts a fresh attempt. */}
      <Building
        key={attempt.key}
        title={t('nutrition.recalculate.building.title')}
        intro={t('nutrition.recalculate.building.wait')}
        lines={lines}
        ready={t('nutrition.recalculate.building.ready')}
        error={t('nutrition.recalculate.building.error')}
        work={() => recalculate.mutateAsync(answers)}
        onDone={attempt.onDone}
        onFail={attempt.onFail}
      />
    </Screen>
  );
}

/** The lines about the goals, from the answers: the goal, the weight and pace, the activity. */
function useGoalLines(answers: TargetAnswers, weightKg: number, unit: WeightUnit): string[] {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const weight = weightLabel(weightKg, unit);
  const aim = weightGoal({
    goal: answers.goal,
    targetWeightKg: answers.targetWeightKg ?? undefined,
    weeklyPaceKg: answers.weeklyPaceKg ?? undefined,
  });
  // As the review shows it.
  const pace =
    aim && t('nutrition.goals.perWeek', { value: format(paceIn(unit, aim.paceKg)), unit });
  return [
    t('nutrition.recalculate.building.lines.goal', { goal: t(`goals.goal.${answers.goal}`) }),
    aim
      ? t(
          `nutrition.recalculate.building.lines.${aim.goal === 'lose_fat' ? 'losing' : 'gaining'}`,
          {
            pace,
            weight,
          },
        )
      : t('nutrition.recalculate.building.lines.keeping', { weight }),
    t('nutrition.recalculate.building.lines.activity', {
      level: t(`goals.activityLevel.${answers.activity}`),
    }),
    t('nutrition.recalculate.building.lines.calories'),
  ];
}
