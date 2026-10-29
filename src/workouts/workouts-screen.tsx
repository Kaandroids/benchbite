import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { useTabScroll } from '@/components/tab-space';
import { TabHeader } from '@/components/tab-header';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday } from '@/i18n/dates';
import { useUserId } from '@/providers/session-provider';
import { InProgressCard } from '@/sessions/in-progress-card';
import { useActiveSession } from '@/sessions/session';
import { useStartOrAsk } from '@/sessions/start-or-ask';
import { useTheme } from '@/theme';

import { WorkoutListItem } from './workout-list-item';
import { useWorkoutLimits, useWorkouts } from './workouts';

/**
 * The Workout tab: the active workouts, with today's highlighted, and the finished workouts below,
 * which the tab passes in as `history`. Inactive workouts are kept in the archive.
 */
export function WorkoutsScreen({ history }: { history?: ReactNode }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { ref, barSpace } = useTabScroll();
  const workouts = useWorkouts();
  const limits = useWorkoutLimits();
  const session = useActiveSession(useUserId());
  const { start, sheet: startSheet } = useStartOrAsk();
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

  return (
    // The tab bar floats over the bottom, so the content scrolls past it.
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[
          styles.content,
          { padding: spacing.xl, paddingBottom: barSpace + spacing.xl, gap: spacing.md },
        ]}
      >
        <TabHeader title={t('workout.title')}>
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
        </TabHeader>

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
      {startSheet}
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
  headerButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
