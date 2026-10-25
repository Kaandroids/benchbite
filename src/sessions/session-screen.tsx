import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { minutesAndSeconds } from '@/lib/time';
import { useUserId } from '@/providers/session-provider';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { enableRestAlerts, useNotificationPermission } from './rest-alarm';
import { RestBar } from './rest-bar';
import { changeRest, sessionTotals, updateSession, useActiveSession } from './session';
import { FoldedExercise, OpenExercise } from './session-exercise';
import { useNow } from './use-now';

/** The workout in progress: one exercise open with its sets, the rest folded, and the rest timer. */
export function SessionScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const session = useActiveSession(useUserId());
  const library = useExerciseLibrary();
  const workoutName = useWorkoutName();
  const now = useNow(!!session, session?.clock?.startedAt);
  const permission = useNotificationPermission();

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

  const details = (id: string) => findExercise(library.data, id);
  const totals = sessionTotals(session);
  const elapsed = Math.max(0, Math.floor((now - session.startedAt) / 1000));

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={[styles.header, { paddingHorizontal: spacing.md, gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('session.minimize')}
          onPress={() => router.back()}
          style={styles.headerButton}
        >
          <Icon name="back" color="textMuted" />
        </Pressable>
        <View style={[styles.flex, styles.center]}>
          <Text variant="label" accessibilityRole="header">
            {workoutName(session)}
          </Text>
          <Text variant="captionStrong" color="textMuted" style={styles.tabular}>
            {minutesAndSeconds(elapsed)}
          </Text>
        </View>
        <PillButton
          variant="primary"
          label={t('session.finish')}
          onPress={() => router.push('/session/finish')}
        />
      </View>

      <View
        style={[
          styles.row,
          { gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
        ]}
      >
        <View style={styles.flex}>
          <ProgressBar value={totals.planned ? totals.done / totals.planned : 0} />
        </View>
        <Text variant="captionStrong" color="textMuted">
          {t('session.setsDone', { done: totals.done, count: totals.planned })}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={{
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingBottom: 140,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {session.exercises.map((exercise, index) =>
          index === session.current ? (
            <OpenExercise
              key={index}
              exercise={exercise}
              index={index}
              info={details(exercise.exerciseId)}
              clock={session.clock}
              now={now}
            />
          ) : (
            <FoldedExercise
              key={index}
              exercise={exercise}
              index={index}
              info={details(exercise.exerciseId)}
            />
          ),
        )}
      </ScrollView>

      {session.rest && session.rest.endsAt > now ? (
        <RestBar
          left={Math.ceil((session.rest.endsAt - now) / 1000)}
          total={session.rest.seconds}
          onChange={(seconds) => updateSession((current) => changeRest(current, seconds))}
          onSkip={() => updateSession((current) => ({ ...current, rest: null }))}
          onTurnOnAlerts={
            permission && !permission.granted
              ? () =>
                  void enableRestAlerts({
                    channelName: t('session.restOver.channel'),
                    offTitle: t('session.restAlerts.offTitle'),
                    offMessage: t('session.restAlerts.offMessage'),
                    openSettings: t('session.restAlerts.openSettings'),
                    notNow: t('session.restAlarm.notNow'),
                  }).catch((error: unknown) => console.warn('Could not turn on rest alerts', error))
              : undefined
          }
        />
      ) : null}
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
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
