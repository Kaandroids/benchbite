import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useExerciseLibrary, findExercise } from '@/exercises/library';
import { useDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useUserId } from '@/providers/session-provider';
import { summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { useRecordFormat } from '@/sets/records';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName, workoutLength } from '@/workouts/format';
import { useWorkouts } from '@/workouts/workouts';

import { EndSheet } from './end-sheet';
import { useLogWorkout } from './logs';
import { newRecords } from './records';
import {
  endSession,
  isLeftOpen,
  lastActivity,
  MAX_WORKOUT_MS,
  sessionTotals,
  stopClock,
  toLog,
  useActiveSession,
} from './session';
import { useStartWorkout } from './start';

/**
 * The summary of the workout in progress, where it is saved or discarded. With `next`, that workout
 * starts afterwards.
 */
export function FinishScreen({ next }: { next?: number }) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const active = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const logWorkout = useLogWorkout();
  const workouts = useWorkouts();
  const startWorkout = useStartWorkout();
  const workoutName = useWorkoutName();
  const formatDate = useDateFormat('full');
  const { format } = useNumberFormat();
  const formatRecord = useRecordFormat();
  // Taken once, so that the summary does not keep counting while the user looks at it.
  const [openedAt] = useState(() => Date.now());
  // When the workout ended, if the user changed it, as when they forgot to finish.
  const [chosenEnd, setChosenEnd] = useState<number | null>(null);
  const [choosingEnd, setChoosingEnd] = useState(false);
  // Only one save, also when Save is tapped twice before the button turns off.
  const saving = useRef(false);

  if (!active) {
    return (
      <Screen onBack={() => router.back()}>
        <MessageView
          icon="dumbbell"
          title={t('session.none.title')}
          message={t('session.none.message')}
        />
      </Screen>
    );
  }

  // It ends now, or at its last set when it was left open longer than a workout can be. It can be
  // set between its last set and now, within the longest a workout can be.
  const lastSet = lastActivity(active);
  const latestEnd = Math.min(openedAt, active.startedAt + MAX_WORKOUT_MS);
  const earliestEnd = Math.min(Math.max(lastSet, active.startedAt + 60_000), latestEnd);
  const finishedAt = chosenEnd ?? (isLeftOpen(active, openedAt) ? lastSet : openedAt);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });

  // A clock still running logs its set, as it would on stopping it when the workout ended. The
  // workout itself keeps it running, so that "Keep going" goes on where it was.
  const session = stopClock(active, finishedAt);
  const name = workoutName(session);
  const totals = sessionTotals(session);
  const seconds = Math.max(0, Math.floor((finishedAt - session.startedAt) / 1000));
  const stats = [
    {
      value: workoutLength(seconds),
      label: t('session.summary.time'),
    },
    {
      value:
        totals.done === totals.planned ? String(totals.done) : `${totals.done} / ${totals.planned}`,
      label: t('session.summary.sets'),
    },
    { value: format(Math.round(totals.kilograms)), label: t('session.summary.kilograms') },
  ];

  const summary = session.exercises.map((exercise) => {
    const info = findExercise(library.data, exercise.exerciseId);
    const done = exercise.sets.filter((s) => s.done);
    const kind = setKindOf(info?.metrics, exercise.target);
    const { best } = summarizeSets(done, kind);
    const sets =
      done.length === exercise.sets.length
        ? t('session.summary.sets', { count: done.length })
        : t('session.setsDone', { done: done.length, count: exercise.sets.length });
    return {
      name: info?.name ?? '',
      text:
        done.length === 0
          ? t('session.summary.skipped')
          : [sets, best ? describeSet(best, kind) : null].filter(Boolean).join(' · '),
    };
  });

  // The best new record of each kind, for every exercise, in the workout's order.
  const records = session.exercises.flatMap((exercise) => {
    const info = findExercise(library.data, exercise.exerciseId);
    const kind = setKindOf(info?.metrics, exercise.target);
    return newRecords(exercise.sets, kind, exercise.bests).records.map((record) => ({
      name: `${info?.name ?? ''} · ${t(`exerciseHistory.kinds.${record.kind}`)}`,
      value: formatRecord(record),
    }));
  });

  const save = async () => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    try {
      await logWorkout.mutateAsync(toLog(session, finishedAt));
      endSession();
      router.dismissAll();
      const following = workouts.data?.find((workout) => workout.id === next);
      if (following) {
        await startWorkout(following);
      }
    } catch (error) {
      saving.current = false;
      console.warn('Could not save the workout', error);
      Alert.alert(t('session.summary.saveErrorTitle'), t('session.summary.saveError'));
    }
  };

  const discard = () =>
    Alert.alert(t('session.summary.discardTitle'), t('session.summary.discardMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('session.summary.discard'),
        style: 'destructive',
        onPress: () => {
          endSession();
          router.dismissAll();
        },
      },
    ]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}>
        <View style={[styles.center, { gap: spacing.sm, paddingTop: spacing.xl }]}>
          <View style={[styles.badge, { backgroundColor: colors.iconBackground }]}>
            <Icon name="check" size={34} color="primary" />
          </View>
          <Text variant="title" accessibilityRole="header" align="center">
            {t('session.summary.title', { name })}
          </Text>
          <Text color="textMuted" align="center">
            {[
              formatDate(new Date(session.startedAt)),
              totals.done < totals.planned ? t('session.summary.early') : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <View style={[styles.stats, { gap: spacing.sm }]}>
          {stats.map((stat) => (
            <View
              key={stat.label}
              style={[
                styles.stat,
                {
                  borderRadius: radii.md,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  padding: spacing.sm,
                },
              ]}
            >
              <Text variant="headline" style={styles.tabular}>
                {stat.value}
              </Text>
              <Text variant="caption" color="textMuted">
                {stat.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={{ gap: spacing.xs }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('session.end.change', { time: time.format(finishedAt) })}
            onPress={() => setChoosingEnd(true)}
            style={[
              styles.end,
              {
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: radii.md,
                backgroundColor: colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.flex}>
              <Text variant="caption" color="textMuted">
                {t('session.end.label', { started: time.format(session.startedAt) })}
              </Text>
              <Text variant="label" style={[styles.tabular]}>
                {time.format(finishedAt)}
              </Text>
            </View>
            <Text variant="label" color="primaryText">
              {t('session.end.changeLabel')}
            </Text>
          </Pressable>
          <Text variant="caption" color="textMuted">
            {t('session.end.hint')}
          </Text>
        </View>

        <Card list>
          {summary.map((item, index) => (
            <View
              key={index}
              style={[
                styles.item,
                {
                  gap: spacing.sm,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                {item.name}
              </Text>
              <Text variant="captionStrong" color="textMuted">
                {item.text}
              </Text>
            </View>
          ))}
        </Card>

        {records.length > 0 ? (
          <Card style={{ padding: spacing.lg, gap: spacing.sm }}>
            <View style={[styles.item, styles.title, { gap: spacing.sm }]}>
              <Icon name="trophy" size={18} color="primary" />
              <Text variant="bodyStrong" style={styles.black}>
                {t('session.summary.records', { count: records.length })}
              </Text>
            </View>
            {records.map((record) => (
              <View key={record.name} style={[styles.record, { gap: spacing.md }]}>
                <Text variant="body" style={[styles.flex, styles.semibold]}>
                  {record.name}
                </Text>
                <Text variant="label" color="primaryText">
                  {record.value}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {totals.done === 0 ? (
          <Text color="textMuted" align="center">
            {t('session.summary.empty')}
          </Text>
        ) : null}
        <Button
          label={t('session.summary.save')}
          disabled={totals.done === 0 || logWorkout.isPending}
          onPress={() => void save()}
        />
        {choosingEnd ? (
          <EndSheet
            value={finishedAt}
            earliest={earliestEnd}
            latest={latestEnd}
            lastSet={time.format(lastSet)}
            onDone={(end) => {
              setChosenEnd(end);
              setChoosingEnd(false);
            }}
            onClose={() => setChoosingEnd(false)}
          />
        ) : null}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.action}>
            <Text variant="label" color="primaryText">
              {t('session.summary.keepGoing')}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={discard} style={styles.action}>
            <Text variant="label" color="danger">
              {t('session.summary.discard')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  black: {
    fontFamily: fonts.black,
    fontSize: 17,
  },
  title: {
    paddingVertical: 0,
  },
  record: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
  },
  end: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  action: {
    height: 44,
    justifyContent: 'center',
  },
});
