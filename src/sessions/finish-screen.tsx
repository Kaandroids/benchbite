import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useExerciseLibrary } from '@/exercises/library';
import { useDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { fonts, useTheme } from '@/theme';
import { minutesAndSeconds, useWorkoutName } from '@/workouts/format';
import { useWorkouts } from '@/workouts/workouts';

import { describeSet, setKindOf } from './fields';
import { useLogWorkout } from './logs';
import {
  endSession,
  sessionTotals,
  stopClock,
  toLog,
  updateSession,
  useActiveSession,
} from './session';
import { useStartWorkout, useUserId } from './start';

/**
 * The summary of the workout in progress, where it is saved or discarded. With `next`, that workout
 * starts afterwards.
 */
export function FinishScreen({ next }: { next?: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const session = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const logWorkout = useLogWorkout();
  const workouts = useWorkouts();
  const startWorkout = useStartWorkout();
  const workoutName = useWorkoutName();
  const formatDate = useDateFormat('full');
  const { format } = useNumberFormat();
  // Taken once, so that the summary does not keep counting while the user looks at it.
  const [finishedAt] = useState(() => Date.now());
  // A clock still running logs its set, which would otherwise be left out as not done.
  useEffect(() => {
    updateSession((current) => stopClock(current, finishedAt));
  }, [finishedAt]);

  if (!session) {
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

  const name = workoutName(session);
  const totals = sessionTotals(session);
  const seconds = Math.max(0, Math.floor((finishedAt - session.startedAt) / 1000));
  const stats = [
    {
      value:
        seconds >= 3600
          ? `${Math.floor(seconds / 3600)}:${minutesAndSeconds(seconds % 3600).padStart(5, '0')}`
          : minutesAndSeconds(seconds),
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
    const info = library.data?.find((item) => item.id === exercise.exerciseId);
    const done = exercise.sets.filter((s) => s.done);
    const best = done[done.length - 1];
    const kind = setKindOf(info?.metrics, exercise.target);
    const sets =
      done.length === exercise.sets.length
        ? t('session.summary.sets', { count: done.length })
        : t('session.setsDone', { done: done.length, planned: exercise.sets.length });
    return {
      name: info?.name ?? '',
      text:
        done.length === 0
          ? t('session.summary.skipped')
          : [sets, best ? describeSet(best, kind) : null].filter(Boolean).join(' · '),
    };
  });

  const save = async () => {
    try {
      await logWorkout.mutateAsync(toLog(session, finishedAt));
      endSession();
      router.dismissAll();
      const following = workouts.data?.find((workout) => workout.id === next);
      if (following) {
        await startWorkout(following);
      }
    } catch (error) {
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

        <View
          style={[
            styles.list,
            {
              borderRadius: radii.lg,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingHorizontal: spacing.lg,
            },
          ]}
        >
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
              <Text variant="caption" color="textMuted" style={styles.bold}>
                {item.text}
              </Text>
            </View>
          ))}
        </View>

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
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.action}>
            <Text variant="bodyStrong" color="primaryText" style={styles.bold}>
              {t('session.summary.keepGoing')}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={discard} style={styles.action}>
            <Text variant="bodyStrong" color="danger" style={styles.bold}>
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
  bold: {
    fontFamily: fonts.extraBold,
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
  list: {
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
