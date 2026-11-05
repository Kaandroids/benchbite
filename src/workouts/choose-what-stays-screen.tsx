import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useUpperCase } from '@/i18n/case';
import { fromIsoDate, useMonthDayFormat, useWeekdayFormat } from '@/i18n/dates';
import { isDbError } from '@/lib/errors';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

import { useAlternativeName } from './alternatives';
import {
  type ChoiceAlternative,
  firstAlternative,
  useChoiceData,
  useChooseWhatStays,
} from './choice';
import { useWorkoutName } from './format';
import type { Workout } from './workouts';

/** To the Today tab; the choice waits in the Workouts tab until it is made. */
const leave = () => router.navigate('/');

/**
 * Premium has ended and more waits than the plan has room for (ADR 0083): the user chooses once
 * which workouts stay, starting from the ones that stay now, and the rest go to the archive
 * (ADR 0084), then which alternative when more could than the one the free plan allows. It goes back once there is no choice to make, whether made
 * here or elsewhere, or as premium returned.
 */
export function ChooseWhatStaysScreen() {
  const { limits, workouts, alternatives, lastTrained } = useChoiceData();
  const queries = [limits, workouts, alternatives, lastTrained];
  const closed = limits.isFetchedAfterMount && limits.data?.choice_open === false;
  useFocusEffect(
    useCallback(() => {
      if (closed) router.back();
    }, [closed]),
  );

  if (
    !allLoaded(queries) ||
    !workouts.isFetchedAfterMount ||
    !alternatives.isFetchedAfterMount ||
    !limits.isFetchedAfterMount ||
    !limits.data ||
    !workouts.data ||
    !alternatives.data ||
    !lastTrained.data
  ) {
    return (
      <Screen closes onBack={leave}>
        <LoadState queries={queries} />
      </Screen>
    );
  }
  return (
    <Choice
      workouts={workouts.data.filter((workout) => workout.active)}
      room={limits.data.workouts}
      alternatives={alternatives.data}
      lastTrained={lastTrained.data}
    />
  );
}

type ChoiceProps = {
  workouts: Workout[];
  room: number;
  alternatives: ChoiceAlternative[];
  lastTrained: Map<number, string>;
};

/** What was chosen so far, and the step that asks for the rest. */
function Choice({ workouts, room, alternatives, lastTrained }: ChoiceProps) {
  const { t } = useTranslation();
  const openPremium = useOpenPremium();
  const choose = useChooseWhatStays();

  const stay = Math.min(workouts.length, room);
  const [kept, setKept] = useState(() =>
    workouts
      .filter((workout) => !workout.held)
      .slice(0, stay)
      .map((workout) => workout.id),
  );
  const candidates = alternatives.filter((alternative) => kept.includes(alternative.workoutId));
  // What the user picked, until the workouts it belongs to change.
  const [picked, setPicked] = useState<number>();
  const alternative = picked ?? firstAlternative(candidates);
  // The free plan, where every choice ends, allows one in all.
  const asksAlternative = candidates.length > 1;
  const asksWorkouts = workouts.length > room;
  const [onWorkouts, setOnWorkouts] = useState(asksWorkouts);

  const saving = choose.isPending;
  const goBack = useCallback(() => {
    if (saving) return;
    if (asksWorkouts && !onWorkouts) setOnWorkouts(true);
    else leave();
  }, [saving, asksWorkouts, onWorkouts]);
  useFocusEffect(
    useCallback(() => {
      const listener = BackHandler.addEventListener('hardwareBackPress', () => {
        goBack();
        return true;
      });
      return () => listener.remove();
    }, [goBack]),
  );

  const submit = () =>
    choose.mutate({
      workouts: kept,
      alternatives: alternative === undefined ? [] : [alternative],
    });
  const failed =
    choose.isError && !isDbError(choose.error, 'noChoiceToMake') ? t('workout.choose.failed') : '';

  return onWorkouts ? (
    <WorkoutsStep
      workouts={workouts}
      stay={stay}
      lastTrained={lastTrained}
      kept={kept}
      onToggle={(id) => {
        setPicked(undefined);
        setKept((now) =>
          now.includes(id)
            ? now.filter((other) => other !== id)
            : now.length < stay
              ? [...now, id]
              : now,
        );
      }}
      onClose={goBack}
      onGetPremium={() => {
        if (!saving) openPremium();
      }}
      onKeep={() => (asksAlternative ? setOnWorkouts(false) : submit())}
      saving={saving}
      failed={failed}
    />
  ) : (
    <AlternativeStep
      candidates={candidates}
      workouts={workouts}
      alternative={alternative}
      onPick={setPicked}
      closes={!asksWorkouts}
      onBack={goBack}
      onKeep={submit}
      saving={saving}
      failed={failed}
    />
  );
}

/** What a step's footer has in common: why the choice failed, and the button that goes on. */
function StepFooter({
  label,
  disabled,
  saving,
  failed,
  onPress,
  children,
}: {
  label: string;
  disabled: boolean;
  saving: boolean;
  failed: string;
  onPress: () => void;
  children?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {failed ? (
        <Text variant="caption" color="danger" align="center" accessibilityLiveRegion="polite">
          {failed}
        </Text>
      ) : null}
      <Button label={label} disabled={disabled} loading={saving} onPress={onPress} />
      {children}
    </View>
  );
}

function WorkoutsStep({
  workouts,
  stay,
  lastTrained,
  kept,
  onToggle,
  onClose,
  onGetPremium,
  onKeep,
  saving,
  failed,
}: {
  workouts: Workout[];
  stay: number;
  lastTrained: Map<number, string>;
  kept: number[];
  onToggle: (id: number) => void;
  onClose: () => void;
  onGetPremium: () => void;
  onKeep: () => void;
  saving: boolean;
  failed: string;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const upper = useUpperCase();
  const workoutName = useWorkoutName();
  const weekdayName = useWeekdayFormat('short');
  const monthDay = useMonthDayFormat();
  return (
    <Screen
      closes
      onBack={onClose}
      footer={
        <StepFooter
          label={t('workout.choose.keep', { count: stay })}
          disabled={kept.length !== stay}
          saving={saving}
          failed={failed}
          onPress={onKeep}
        >
          <TextLink
            label={t('workout.choose.getBack')}
            align="center"
            size="regular"
            onPress={onGetPremium}
          />
        </StepFooter>
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
                  ? t('workout.choose.trained', { day: monthDay(fromIsoDate(trained)) })
                  : t('workout.choose.notTrained'),
              ].join(' · ')}
              selected={kept.includes(workout.id)}
              onPress={() => onToggle(workout.id)}
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

function AlternativeStep({
  candidates,
  workouts,
  alternative,
  onPick,
  closes,
  onBack,
  onKeep,
  saving,
  failed,
}: {
  candidates: ChoiceAlternative[];
  workouts: Workout[];
  alternative?: number;
  onPick: (id: number) => void;
  /** Whether it is the first step, whose cross leaves, rather than going back to the workouts. */
  closes: boolean;
  onBack: () => void;
  onKeep: () => void;
  saving: boolean;
  failed: string;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const workoutName = useWorkoutName();
  const alternativeName = useAlternativeName();
  const monthDay = useMonthDayFormat();
  return (
    <Screen
      closes={closes}
      onBack={onBack}
      footer={
        <StepFooter
          label={t('workout.choose.keep', { count: 1 })}
          disabled={alternative === undefined}
          saving={saving}
          failed={failed}
          onPress={onKeep}
        />
      }
    >
      <Text variant="title" accessibilityRole="header">
        {t('workout.choose.alternativeTitle')}
      </Text>
      <Text>{t('workout.choose.alternativeBody')}</Text>
      <View style={{ gap: spacing.sm }}>
        {candidates.map((candidate) => {
          const workout = workouts.find(({ id }) => id === candidate.workoutId);
          return (
            <ChoiceCard
              key={candidate.id}
              size="compact"
              title={alternativeName(candidate)}
              description={[
                workout ? workoutName(workout) : null,
                candidate.lastUsedAt
                  ? t('workout.choose.used', { day: monthDay(candidate.lastUsedAt) })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              selected={alternative === candidate.id}
              onPress={() => onPick(candidate.id)}
            />
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  counts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
