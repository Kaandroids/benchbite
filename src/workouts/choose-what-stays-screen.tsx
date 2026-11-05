import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useUpperCase } from '@/i18n/case';
import { useMonthDayFormat, useWeekdayFormat } from '@/i18n/dates';
import { isDbError } from '@/lib/errors';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

import { useAlternativeName } from './alternatives';
import {
  alternativesOf,
  alternativesThatStay,
  type ChoiceAlternative,
  firstAlternatives,
  useChoiceAlternatives,
  useChooseWhatStays,
  useLastTrained,
} from './choice';
import { useWorkoutName } from './format';
import { useWorkoutLimits, useWorkouts, type Workout } from './workouts';

/**
 * Premium has ended and more waits than the plan has room for (ADR 0083): the user chooses once
 * which workouts stay, starting from the ones that stay now, then which alternatives when there are
 * more than can stay. The cross leaves for the Today tab, to choose later.
 */
export function ChooseWhatStaysScreen() {
  const workouts = useWorkouts();
  const limits = useWorkoutLimits();
  const alternatives = useChoiceAlternatives();
  const lastTrained = useLastTrained();
  const queries = [workouts, limits, alternatives, lastTrained];
  const active = workouts.data?.filter((workout) => workout.active) ?? [];

  if (!allLoaded(queries) || !limits.data || !alternatives.data) {
    return (
      <Screen closes onBack={leave}>
        <LoadState queries={queries} />
      </Screen>
    );
  }
  return (
    <Choice
      workouts={active}
      room={limits.data.workouts}
      alternativeLimits={{
        versions: limits.data.alternatives,
        added: limits.data.added_alternatives,
      }}
      alternatives={alternatives.data}
      lastTrained={lastTrained.data ?? new Map()}
    />
  );
}

/** To the Today tab; the choice waits in the Workouts tab until it is made. */
const leave = () => router.navigate('/');

type ChoiceProps = {
  workouts: Workout[];
  room: number;
  alternativeLimits: Parameters<typeof alternativesThatStay>[1];
  alternatives: ChoiceAlternative[];
  lastTrained: Map<number, string>;
};

function Choice({ workouts, room, alternativeLimits, alternatives, lastTrained }: ChoiceProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const upper = useUpperCase();
  const openPremium = useOpenPremium();
  const choose = useChooseWhatStays();
  const workoutName = useWorkoutName();
  const alternativeName = useAlternativeName();
  const weekdayName = useWeekdayFormat('short');
  const monthDay = useMonthDayFormat();

  const stay = Math.min(workouts.length, room);
  const [kept, setKept] = useState(() =>
    workouts
      .filter((workout) => !workout.held)
      .slice(0, stay)
      .map((workout) => workout.id),
  );
  const candidates = alternativesOf(alternatives, kept);
  const alternativesStay = alternativesThatStay(candidates, alternativeLimits);
  // What the user picked of them, until the workouts they belong to change.
  const [picked, setPicked] = useState<number[] | null>(null);
  const keptAlternatives = picked ?? firstAlternatives(candidates, alternativesStay);
  const asksWorkouts = workouts.length > room;
  const asksAlternatives = candidates.length > alternativesStay;
  const [step, setStep] = useState<'workouts' | 'alternatives'>(
    asksWorkouts ? 'workouts' : 'alternatives',
  );

  const toggleWorkout = (id: number) => {
    setPicked(null);
    setKept((now) =>
      now.includes(id)
        ? now.filter((other) => other !== id)
        : now.length < stay
          ? [...now, id]
          : now,
    );
  };
  const pickAlternative = (id: number) =>
    setPicked(
      alternativesStay === 1
        ? [id]
        : keptAlternatives.includes(id)
          ? keptAlternatives.filter((other) => other !== id)
          : keptAlternatives.length < alternativesStay
            ? [...keptAlternatives, id]
            : keptAlternatives,
    );

  const submit = () =>
    choose.mutate(
      {
        workouts: kept,
        alternatives: asksAlternatives ? keptAlternatives : candidates.map((a) => a.id),
      },
      {
        onSuccess: () => router.back(),
        onError: (error) => {
          // Made elsewhere meanwhile: there is nothing left to choose here.
          if (isDbError(error, 'noChoiceToMake')) router.back();
        },
      },
    );

  const failure =
    choose.isError && !isDbError(choose.error, 'noChoiceToMake') ? (
      <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
        {t('workout.choose.failed')}
      </Text>
    ) : null;

  if (step === 'alternatives' && asksAlternatives) {
    return (
      <Screen
        closes={!asksWorkouts}
        onBack={asksWorkouts ? () => setStep('workouts') : leave}
        footer={
          <View style={{ gap: spacing.sm }}>
            {failure}
            <Button
              label={t('workout.choose.keep', { count: alternativesStay })}
              disabled={keptAlternatives.length !== alternativesStay}
              loading={choose.isPending}
              onPress={submit}
            />
          </View>
        }
      >
        <Text variant="title" accessibilityRole="header">
          {t('workout.choose.alternativesTitle', { count: alternativesStay })}
        </Text>
        <Text>{t('workout.choose.alternativesBody', { count: alternativesStay })}</Text>
        <View style={{ gap: spacing.sm }}>
          {candidates.map((alternative) => {
            const workout = workouts.find(({ id }) => id === alternative.workoutId);
            return (
              <ChoiceCard
                key={alternative.id}
                type={alternativesStay === 1 ? 'radio' : 'checkbox'}
                size="compact"
                title={alternativeName(alternative)}
                description={[
                  workout ? workoutName(workout) : null,
                  alternative.lastUsedAt
                    ? t('workout.choose.used', { day: monthDay(alternative.lastUsedAt) })
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                selected={keptAlternatives.includes(alternative.id)}
                onPress={() => pickAlternative(alternative.id)}
              />
            );
          })}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      closes
      onBack={leave}
      footer={
        <View style={{ gap: spacing.sm }}>
          {failure}
          <Button
            label={t('workout.choose.keep', { count: stay })}
            disabled={kept.length !== stay}
            loading={choose.isPending}
            onPress={() => (asksAlternatives ? setStep('alternatives') : submit())}
          />
          <TextLink
            label={t('workout.choose.getBack')}
            align="center"
            size="regular"
            onPress={openPremium}
          />
        </View>
      }
    >
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">
          {t('workout.choose.title')}
        </Text>
        <Text variant="caption" color="textMuted">
          {t('workout.choose.nothingDeleted')}
        </Text>
      </View>
      <Text>{t('workout.choose.body', { count: stay })}</Text>
      <View style={[styles.counts, { paddingHorizontal: spacing.xs }]}>
        <Text variant="captionStrong" color="textMuted">
          {upper(t('workout.choose.workouts'))}
        </Text>
        <Text variant="captionStrong" color="primaryText">
          {t('workout.choose.chosen', { chosen: kept.length, count: stay })}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {workouts.map((workout) => {
          const trained = lastTrained.get(workout.id);
          return (
            <ChoiceCard
              key={workout.id}
              type="checkbox"
              size="compact"
              title={workoutName(workout)}
              description={[
                workout.weekdays.length > 0
                  ? workout.weekdays.map((weekday) => weekdayName(weekday)).join(' ')
                  : t('workout.anyDay'),
                trained
                  ? t('workout.choose.trained', { day: monthDay(new Date(`${trained}T12:00:00`)) })
                  : t('workout.choose.notTrained'),
              ].join(' · ')}
              selected={kept.includes(workout.id)}
              onPress={() => toggleWorkout(workout.id)}
            />
          );
        })}
      </View>
      <Text variant="caption" color="textMuted">
        {t('workout.choose.note')}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
