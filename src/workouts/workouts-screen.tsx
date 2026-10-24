import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Icon } from '@/components/ui/icon';
import { afterSheetCloses } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { isoWeekday } from '@/i18n/dates';
import { useUserId } from '@/providers/session-provider';
import { BusySheet } from '@/sessions/busy-sheet';
import { InProgressCard } from '@/sessions/in-progress-card';
import { endSession, useActiveSession } from '@/sessions/session';
import { useStartWorkout } from '@/sessions/start';
import { useTheme } from '@/theme';

import { WorkoutListItem } from './workout-list-item';
import { useWorkoutLimits, useWorkouts, type Workout } from './workouts';

/**
 * The Workout tab: the active workouts, with today's highlighted, and the finished workouts below,
 * which the tab passes in as `history`. Inactive workouts are kept in the archive.
 */
export function WorkoutsScreen({ history }: { history?: ReactNode }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const limits = useWorkoutLimits();
  const session = useActiveSession(useUserId());
  const startWorkout = useStartWorkout();
  // The workout to start once the user says what happens to the one in progress.
  const [waiting, setWaiting] = useState<Workout | null>(null);
  const active = workouts.data?.filter((workout) => workout.active) ?? [];
  const today = isoWeekday(new Date());
  // Archived workouts count too (ADR 0018).
  const full = limits.data !== undefined && (workouts.data?.length ?? 0) >= limits.data.workouts;

  const create = () => {
    if (full) {
      Alert.alert(t('workout.limitTitle'), t('workout.limit', { max: limits.data.workouts }));
      return;
    }
    router.push('/workout/edit');
  };

  const start = (workout: Workout) => {
    if (session) {
      setWaiting(workout);
    } else {
      void startWorkout(workout);
    }
  };

  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.xl, gap: spacing.md }]}
      >
        <View style={styles.header}>
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            {t('workout.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('workout.archive.title')}
            onPress={() => router.push('/workout/archive')}
            style={({ pressed }) => [
              styles.headerButton,
              {
                borderRadius: radii.full,
                backgroundColor: pressed ? colors.track : colors.surface,
                borderColor: colors.border,
              },
            ]}
          >
            <Icon name="archive" color="textMuted" />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('editor.newTitle')}
            onPress={create}
            style={({ pressed }) => [
              styles.headerButton,
              {
                borderRadius: radii.full,
                backgroundColor: colors.primaryButton,
                borderColor: colors.primaryButton,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Icon name="plus" color="onPrimary" />
          </Pressable>
        </View>

        <LoadState queries={[workouts]} />
        {allLoaded([workouts]) ? (
          <>
            {session ? <InProgressCard session={session} /> : null}
            <Text variant="captionStrong" color="textMuted">
              {t('workout.activeCount', { count: active.length })}
            </Text>
            {active.length > 0 ? (
              active.map((workout) => (
                <WorkoutListItem
                  key={workout.id}
                  workout={workout}
                  today={workout.weekdays.includes(today)}
                  running={session?.workoutId === workout.id}
                  onStart={() => start(workout)}
                />
              ))
            ) : (
              <Text color="textMuted">{t('workout.noActive')}</Text>
            )}

            {history ? <View style={{ marginTop: spacing.md }}>{history}</View> : null}
          </>
        ) : null}
      </ScrollView>
      {session ? (
        <BusySheet
          session={session}
          next={waiting}
          onResume={() => {
            setWaiting(null);
            router.push('/session');
          }}
          onFinish={() => {
            const next = waiting;
            setWaiting(null);
            router.push({ pathname: '/session/finish', params: { next: String(next?.id) } });
          }}
          onDiscard={() => {
            const next = waiting;
            setWaiting(null);
            // The running workout ends only once the new one is sure to start, which may ask first.
            if (next) {
              afterSheetCloses(() => void startWorkout(next, { beforeStart: endSession }));
            }
          }}
          onClose={() => setWaiting(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    flex: 1,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
