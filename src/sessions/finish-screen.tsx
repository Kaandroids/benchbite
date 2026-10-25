import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { useClockFormat, useDateFormat } from '@/i18n/dates';
import { useUserId } from '@/providers/session-provider';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useWorkouts, findWorkout } from '@/workouts/workouts';

import { EndSheet } from './end-sheet';
import { EndTime, ExerciseSummary, FinishStats, NewRecords } from './finish-sections';
import { useLogWorkout } from './logs';
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
  const { t } = useTranslation();
  const time = useClockFormat();
  const { colors, spacing } = useTheme();
  const active = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const logWorkout = useLogWorkout();
  const workouts = useWorkouts();
  const startWorkout = useStartWorkout();
  const workoutName = useWorkoutName();
  const formatDate = useDateFormat('full');
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

  // A clock still running logs its set, as it would on stopping it when the workout ended. The
  // workout itself keeps it running, so that "Keep going" goes on where it was.
  const session = stopClock(active, finishedAt);
  const name = workoutName(session);
  const totals = sessionTotals(session);
  const details = (id: string) => findExercise(library.data, id);

  const save = async () => {
    if (saving.current) {
      return;
    }
    saving.current = true;
    try {
      await logWorkout.mutateAsync(toLog(session, finishedAt));
      endSession();
      router.dismissAll();
      const following = findWorkout(workouts.data, next);
      if (following) {
        await startWorkout(following);
      }
    } catch (error) {
      saving.current = false;
      console.warn('Could not save the workout', error);
      Alert.alert(t('common.notSaved'), t('session.summary.saveError'));
    }
  };

  const discard = () =>
    Alert.alert(t('session.summary.discardTitle'), t('session.summary.discardMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('common.discard'),
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

        <FinishStats session={session} totals={totals} finishedAt={finishedAt} />
        <EndTime
          startedAt={session.startedAt}
          finishedAt={finishedAt}
          onChange={() => setChoosingEnd(true)}
        />
        <ExerciseSummary session={session} details={details} />
        <NewRecords session={session} details={details} />

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
            lastSet={time(lastSet)}
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
              {t('common.discard')}
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
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
