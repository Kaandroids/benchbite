import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import type { Workout } from '@/workouts/workouts';

import { sessionTotals, type Session } from './session';
import { useNow } from './use-now';

type BusySheetProps = {
  session: Session;
  /** The workout the user wants to start, or null while the sheet is closed. */
  next: Workout | null;
  onResume: () => void;
  onFinish: () => void;
  onDiscard: () => void;
  onClose: () => void;
};

/** Asks what to do with the workout in progress before another one starts. */
export function BusySheet({
  session,
  next,
  onResume,
  onFinish,
  onDiscard,
  onClose,
}: BusySheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workoutName = useWorkoutName();
  const now = useNow(!!next);
  if (!next) {
    return null;
  }
  const name = workoutName(session);
  const nextName = workoutName(next);
  const minutes = Math.max(1, Math.round((now - session.startedAt) / 60_000));

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          {t('session.busy.title', { name })}
        </Text>
        <Text color="textMuted">
          {t('session.busy.message', { minutes, count: sessionTotals(session).done })}
        </Text>
      </View>
      <Button label={t('session.busy.resume', { name })} onPress={onResume} />
      <Pressable
        accessibilityRole="button"
        onPress={onFinish}
        style={[
          styles.option,
          {
            borderRadius: radii.lg,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text variant="label">{t('session.busy.finish', { name, next: nextName })}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.discard}>
        <Text variant="label" color="danger">
          {t('session.busy.discard', { name, next: nextName })}
        </Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    height: 52,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discard: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
