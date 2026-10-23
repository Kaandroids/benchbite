import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';
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
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
        />
        <SafeAreaView
          edges={['bottom']}
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            padding: spacing.xl,
            gap: spacing.lg,
          }}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
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
            <Text variant="bodyStrong" style={styles.bold}>
              {t('session.busy.finish', { name, next: nextName })}
            </Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.discard}>
            <Text variant="bodyStrong" color="danger" style={styles.bold}>
              {t('session.busy.discard', { name, next: nextName })}
            </Text>
          </Pressable>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
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
