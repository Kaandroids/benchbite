import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat, weightIn } from '@/i18n/units';
import { supabase } from '@/lib/supabase';
import { useTheme, type ColorTokens } from '@/theme';

import { projectedDate } from '../body';
import { saveOnboarding, type WorkoutPlan } from '../plan';
import { useStep } from '../use-step';
import { WeightChart } from './weight-chart';

/** Exercise names shown per session before "+n more". */
const NAMES_SHOWN = 4;

const MACROS: { key: 'protein' | 'carbs' | 'fat'; color: keyof ColorTokens }[] = [
  { key: 'protein', color: 'protein' },
  { key: 'carbs', color: 'carbs' },
  { key: 'fat', color: 'fat' },
];

/** Exercise names in the app language, falling back to English. */
function useExerciseNames(plan: WorkoutPlan | undefined): Record<string, string> {
  const { i18n } = useTranslation();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!plan) {
      return;
    }
    const ids = [
      ...new Set(plan.sessions.flatMap((session) => session.exercises.map((e) => e.exerciseId))),
    ];
    let cancelled = false;
    void supabase
      .from('exercises')
      .select('id, name, exercise_translations (language, name)')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(
          Object.fromEntries(
            data.map((exercise) => [
              exercise.id,
              exercise.exercise_translations.find((t) => t.language === i18n.language)?.name ??
                exercise.name,
            ]),
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [plan, i18n.language]);

  return names;
}

/**
 * The result of the onboarding: the projected weight, the daily targets and the week's workouts.
 * Continuing saves everything in one transaction.
 */
export function PlanStep() {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weekday = useWeekdayFormat();
  const { answers, progress, next, back } = useStep('plan');
  const { targets, plan } = answers;
  const names = useExerciseNames(plan);
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
  const showWeight = (kg: number) =>
    `${format(weightIn(unit, kg), { maximumFractionDigits: 1 })} ${unit}`;

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

  const card = [
    styles.card,
    { borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radii.lg },
    { padding: spacing.lg, gap: spacing.md },
  ];

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.sm }}>
          {saveFailed ? (
            <Text color="danger" style={styles.centered}>
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
        <Animated.View entering={FadeInDown.duration(400)} style={card}>
          <Text variant="headline">{t('onboarding.plan.weight')}</Text>
          <WeightChart
            falling={targetKg < weightKg}
            start={{ value: showWeight(weightKg), label: t('onboarding.plan.today') }}
            end={{
              value: showWeight(targetKg),
              label: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(
                projectedDate(weightKg, targetKg, pace, new Date()),
              ),
            }}
          />
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.delay(150).duration(400)} style={card}>
        <Text variant="headline">{t('onboarding.plan.nutrition')}</Text>
        <Text variant="title" color="primaryText">
          {t('onboarding.plan.calories', { calories: format(targets.calories) })}
        </Text>
        <View style={[styles.macros, { gap: spacing.sm }]}>
          {MACROS.map(({ key, color }) => (
            <View
              key={key}
              style={[
                styles.macro,
                { borderRadius: radii.md, backgroundColor: colors.track, padding: spacing.md },
              ]}
            >
              <View style={[styles.dot, { backgroundColor: colors[color] }]} />
              <Text variant="bodyStrong">
                {t('onboarding.plan.grams', {
                  count:
                    key === 'protein'
                      ? targets.proteinG
                      : key === 'carbs'
                        ? targets.carbsG
                        : targets.fatG,
                })}
              </Text>
              <Text variant="caption" color="textMuted">
                {t(`onboarding.plan.macros.${key}`)}
              </Text>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)} style={card}>
        <Text variant="headline">{t('onboarding.plan.week')}</Text>
        {plan.sessions.map((session) => {
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
              <Text variant="bodyStrong">{t(`onboarding.plan.sessionTypes.${session.type}`)}</Text>
              <Text variant="caption" color="textMuted">
                {t('onboarding.plan.session', {
                  count: session.exercises.length,
                  minutes: session.estimatedMinutes,
                })}
              </Text>
              {shown ? (
                <Text variant="caption">
                  {shown}
                  {hidden > 0 ? ` ${t('onboarding.plan.more', { count: hidden })}` : ''}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Animated.View>

      <Text variant="caption" color="textMuted" style={styles.centered}>
        {t('onboarding.plan.editLater')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
    gap: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginBottom: 4,
  },
  session: {
    paddingVertical: 4,
  },
  centered: {
    textAlign: 'center',
  },
});
