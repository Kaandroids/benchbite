import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useExerciseLibrary } from '@/exercises/library';
import { fonts, useTheme } from '@/theme';
import { minutesAndSeconds, useWorkoutName } from '@/workouts/format';

import { sessionTotals, type Session } from './session';
import { useNow } from './use-now';

// Dark in both themes, like the rest timer, so that the workout in progress stands out.
const CARD = '#16171A';
const MUTED = '#C9CBD1';
const TRACK = '#3A3C42';

/** The workout in progress, at the top of the Workout tab, which opens it again. */
export function InProgressCard({ session }: { session: Session }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const library = useExerciseLibrary();
  const workoutName = useWorkoutName();
  const now = useNow(true);
  const totals = sessionTotals(session);
  const current = session.exercises[session.current];
  const exercise = library.data?.find((item) => item.id === current?.exerciseId)?.name ?? '';
  const elapsed = Math.max(0, Math.floor((now - session.startedAt) / 1000));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('session.inProgress')}: ${workoutName(session)}`}
      accessibilityHint={t('session.resume')}
      onPress={() => router.push('/workout/session')}
      style={({ pressed }) => [
        styles.card,
        {
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={[styles.dot, { backgroundColor: colors.primary }]} />
        <Text variant="caption" style={[styles.bold, { color: colors.planned }]}>
          {t('session.inProgress')}
        </Text>
        <View style={styles.flex} />
        <Text variant="headline" style={[styles.bold, styles.light, styles.tabular]}>
          {minutesAndSeconds(elapsed)}
        </Text>
      </View>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.flex}>
          <Text variant="headline" style={styles.light}>
            {workoutName(session)}
          </Text>
          <Text variant="caption" numberOfLines={1} style={[styles.semibold, { color: MUTED }]}>
            {t('session.current', { done: totals.done, planned: totals.planned, exercise })}
          </Text>
        </View>
        <View
          style={[
            styles.resume,
            { borderRadius: radii.full, backgroundColor: colors.primaryButton },
          ]}
        >
          <Text variant="bodyStrong" color="onPrimary" style={styles.bold}>
            {t('session.resume')}
          </Text>
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: colors.primary,
              width: `${totals.planned ? (totals.done / totals.planned) * 100 : 0}%`,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  light: {
    color: '#FFFFFF',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  resume: {
    height: 40,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: TRACK,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
  },
});
