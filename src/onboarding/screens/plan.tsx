import { Redirect } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useExerciseNames } from '@/exercises/use-exercise-names';
import { useDateFormat, useWeekdayFormat } from '@/i18n/dates';
import { useWeightFormat } from '@/i18n/units';
import { MacroTargets } from '@/nutrition/macro-targets';
import { useTheme } from '@/theme';

import { projectedDate } from '../body';
import { saveOnboarding } from '../plan';
import { planDays } from '../plan-days';
import { useStep } from '../use-step';
import { WeightChart } from './weight-chart';

/** Exercise names shown per session before "+n more". */
const NAMES_SHOWN = 4;

/**
 * The result of the onboarding: the projected weight, the daily targets and the week's workouts.
 * Continuing saves everything in one transaction.
 */
export function PlanStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const formatWeight = useWeightFormat();
  const formatDate = useDateFormat('medium');
  const weekday = useWeekdayFormat();
  const { answers, progress, next, back } = useStep('plan');
  const { targets, plan } = answers;
  const names = useExerciseNames(
    plan?.sessions.flatMap((session) => session.exercises.map((e) => e.exerciseId)) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  if (!targets || !plan) {
    // Reached without a result, for example from an old draft: build it again.
    return <Redirect href={{ pathname: '/onboarding/[step]', params: { step: 'building' } }} />;
  }

  const unit = answers.weightUnit ?? 'kg';
  const weightKg = answers.weightKg ?? 0;
  const targetKg = answers.targetWeightKg;
  const pace = answers.weeklyPaceKg;
  const changesWeight =
    (answers.goal === 'lose_fat' || answers.goal === 'build_muscle') && targetKg && pace;
  const showWeight = (kg: number) => `${formatWeight(kg, unit)} ${unit}`;

  const save = async () => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await saveOnboarding(answers, plan);
      next();
    } catch (error) {
      console.warn('Could not save the onboarding', error);
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.sm }}>
          {saveFailed ? (
            <Text color="danger" align="center">
              {t('onboarding.plan.saveError')}
            </Text>
          ) : null}
          <Button
            label={saveFailed ? t('common.tryAgain') : t('onboarding.plan.start')}
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      }
    >
      <Text variant="title">{t('onboarding.steps.plan.title')}</Text>

      {changesWeight ? (
        <Card entering={FadeInDown.duration(400)}>
          <Text variant="headline">{t('onboarding.plan.weight')}</Text>
          <WeightChart
            falling={targetKg < weightKg}
            start={{ value: showWeight(weightKg), label: t('onboarding.plan.today') }}
            end={{
              value: showWeight(targetKg),
              label: formatDate(projectedDate(weightKg, targetKg, pace, new Date())),
            }}
          />
        </Card>
      ) : null}

      <Card entering={FadeInDown.delay(150).duration(400)}>
        <Text variant="headline">{t('onboarding.plan.nutrition')}</Text>
        <MacroTargets targets={targets} />
      </Card>

      <Card entering={FadeInDown.delay(300).duration(400)}>
        <Text variant="headline">{t('onboarding.plan.week')}</Text>
        {planDays(plan).map((session) => {
          const exerciseNames = session.exercises.map(
            (exercise) => names[exercise.exerciseId] ?? '',
          );
          const shown = exerciseNames.slice(0, NAMES_SHOWN).filter(Boolean).join(' · ');
          const hidden = exerciseNames.length - NAMES_SHOWN;
          return (
            <View key={session.weekday} style={[styles.session, { gap: 2 }]}>
              <Text variant="caption" color="primaryText">
                {weekday(session.weekday)}
              </Text>
              <Text variant="bodyStrong">{t(`workout.sessionTypes.${session.type}`)}</Text>
              <Text variant="caption" color="textMuted">
                {t('workout.session', {
                  count: session.exercises.length,
                  minutes: session.estimatedMinutes,
                })}
              </Text>
              {shown ? (
                <Text variant="caption">
                  {shown}
                  {hidden > 0 ? ` ${t('workout.more', { count: hidden })}` : ''}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Text variant="caption" color="textMuted" align="center">
        {t('onboarding.plan.editLater')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  session: {
    paddingVertical: 4,
  },
});
