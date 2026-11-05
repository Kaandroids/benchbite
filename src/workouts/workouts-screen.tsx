import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { useTabScroll } from '@/components/tab-space';
import { TabHeader } from '@/components/tab-header';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { isoWeekday } from '@/i18n/dates';
import { usePlanNumbers } from '@/premium/plan';
import { useUserId } from '@/providers/session-provider';
import { InProgressCard } from '@/sessions/in-progress-card';
import { useActiveSession } from '@/sessions/session';
import { useStartOrAsk } from '@/sessions/start-or-ask';
import { useTheme } from '@/theme';

import { HeldBanner } from './held-banner';
import { WorkoutLimitSheet } from './workout-limit-sheet';
import { WorkoutListItem } from './workout-list-item';
import { showsAsWaiting, useWorkoutLimits, useWorkouts } from './workouts';

/**
 * The Workout tab: the active workouts, with today's highlighted, and the finished workouts below,
 * which the tab passes in as `history`. Inactive workouts are kept in the archive. Those that wait
 * for premium stay in their place, locked, under a banner that says how many wait.
 */
export function WorkoutsScreen({ history }: { history?: ReactNode }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { ref, barSpace } = useTabScroll();
  const workouts = useWorkouts();
  const limits = useWorkoutLimits();
  const numbers = usePlanNumbers();
  const [limitShown, setLimitShown] = useState(false);
  const session = useActiveSession(useUserId());
  const { start, sheet: startSheet } = useStartOrAsk();
  const active = workouts.data?.filter((workout) => workout.active) ?? [];
  // Not archived ones, which the archive says of itself (ADR 0082); not one running.
  const held = active.filter((workout) =>
    showsAsWaiting(workout, session?.workoutId === workout.id),
  ).length;
  const today = isoWeekday(new Date());
  // As the limit counts them: archived ones only on a plan with the archive (ADR 0082).
  const count = limits.data?.workouts_counted ?? 0;
  const full = limits.data !== undefined && count >= limits.data.workouts;
  // The room premium would give, on a plan with less; none on premium itself.
  const premium = numbers.data?.premium;
  const premiumRoom =
    limits.data &&
    premium?.workouts != null &&
    premium.versions != null &&
    premium.workouts > limits.data.workouts
      ? { workouts: premium.workouts, versions: premium.versions }
      : null;

  const create = () => {
    if (full) {
      if (premiumRoom) {
        setLimitShown(true);
      } else {
        Alert.alert(t('workout.limitTitle'), t('workout.limit', { max: limits.data.workouts }));
      }
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
            {held > 0 ? <HeldBanner count={held} /> : null}
            {session ? <InProgressCard session={session} /> : null}
            <Text variant="captionStrong" color="textMuted">
              {t('workout.activeCount', { count: active.length })}
            </Text>
            {active.length > 0 ? (
              active.map((workout) => (
                <WorkoutListItem
                  key={workout.id}
                  workout={workout}
                  today={today}
                  running={session?.workoutId === workout.id}
                  onStart={() => start(workout)}
                />
              ))
            ) : (
              <Text color="textMuted">
                {t(limits.data?.archive === false ? 'workout.noActiveFree' : 'workout.noActive')}
              </Text>
            )}

            {history ? <View style={{ marginTop: spacing.md }}>{history}</View> : null}
          </>
        ) : null}
      </ScrollView>
      {startSheet}
      {limitShown && limits.data && premiumRoom ? (
        <WorkoutLimitSheet
          count={count}
          max={limits.data.workouts}
          premium={premiumRoom}
          onClose={() => setLimitShown(false)}
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
  headerButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
