import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useUserId } from '@/providers/session-provider';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';

import { useLogWorkout } from './logs';
import {
  endSession,
  isLeftOpen,
  lastActivity,
  sessionTotals,
  stopClock,
  toLog,
  useActiveSession,
} from './session';

type Saved = { logId: number; name: string; endedAt: number };

/**
 * Saves a workout left open longer than a workout can be, as finished at its last set, whenever
 * the app opens or comes back, and says so once. Without a connection it tries again the next
 * time. A workout with no set done is left as it is, as there is nothing to save.
 */
export function LeftOpenSaver() {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useActiveSession(useUserId());
  const { mutateAsync: logWorkout } = useLogWorkout();
  const workoutName = useWorkoutName();
  const [saved, setSaved] = useState<Saved | null>(null);
  const saving = useRef(false);

  useEffect(() => {
    const save = () => {
      if (!session || saving.current || !isLeftOpen(session)) {
        return;
      }
      if (sessionTotals(session).done === 0) {
        return;
      }
      saving.current = true;
      const endedAt = lastActivity(session);
      logWorkout(toLog(stopClock(session, endedAt), endedAt))
        .then((logId) => {
          endSession();
          setSaved({ logId, name: workoutName(session), endedAt });
        })
        .catch((error: unknown) => console.warn('Could not save the workout left open', error))
        .finally(() => {
          saving.current = false;
        });
    };
    save();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        save();
      }
    });
    return () => subscription.remove();
  }, [session, logWorkout, workoutName]);

  if (!saved) {
    return null;
  }
  const time = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }).format(saved.endedAt);
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.card,
        {
          top: insets.top + spacing.sm,
          left: spacing.lg,
          right: spacing.lg,
          gap: spacing.md,
          padding: spacing.lg,
          borderRadius: radii.lg,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View
        style={[styles.icon, { borderRadius: radii.md, backgroundColor: colors.iconBackground }]}
      >
        <Icon name="check" size={20} color="primary" />
      </View>
      <View style={[styles.flex, { gap: spacing.xs }]}>
        <Text variant="label">{t('session.leftOpen.title', { name: saved.name })}</Text>
        <Text variant="caption" color="textMuted">
          {t('session.leftOpen.message', { time })}
        </Text>
        <View style={[styles.actions, { gap: spacing.lg }]}>
          <TextLink
            label={t('session.leftOpen.view')}
            size="regular"
            onPress={() => {
              setSaved(null);
              router.push({ pathname: '/workout/log/[id]', params: { id: String(saved.logId) } });
            }}
          />
          <TextLink
            label={t('session.leftOpen.dismiss')}
            tone="muted"
            size="regular"
            onPress={() => setSaved(null)}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    flexDirection: 'row',
    borderWidth: 1,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  icon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
  },
});
