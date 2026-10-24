import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { useTimeFormat, useWeekdayFormat } from '@/i18n/dates';
import { cancelReminders, requestReminderPermission } from '@/reminders/reminders';
import { saveReminderMinutes } from '@/reminders/settings';
import { useTheme } from '@/theme';

import { planDays } from '../plan-days';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

/** Every quarter of an hour, in minutes after midnight. */
const TIMES = Array.from({ length: 24 * 4 }, (_, index) => index * 15);
/** 18:00, after work for most people. */
const DEFAULT_TIME = 18 * 60;

/**
 * Offers workout reminders on the training days. The system asks for permission only after the
 * user chose to turn them on, so the prompt comes with a reason. Declining, here or in the
 * prompt, just moves on.
 */
export function RemindersStep() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const formatTime = useTimeFormat();
  const { answers, progress, next, back } = useStep('reminders');
  const [minutes, setMinutes] = useState(answers.reminderMinutes ?? DEFAULT_TIME);
  const [enabling, setEnabling] = useState(false);
  const sessions = answers.plan ? planDays(answers.plan) : [];

  const enable = async () => {
    setEnabling(true);
    try {
      if (!(await requestReminderPermission(t('reminders.channel')))) {
        next({ reminderMinutes: undefined });
        return;
      }
      // The reminders are scheduled from the week once the app opens (ADR 0029).
      saveReminderMinutes(minutes);
      next({ reminderMinutes: minutes });
    } catch (error) {
      // Reminders are a convenience; failing to set them must not stop the onboarding.
      console.warn('Could not turn on the reminders', error);
      next({ reminderMinutes: undefined });
    } finally {
      setEnabling(false);
    }
  };

  const skip = () => {
    // Removes reminders turned on before coming back to this step.
    saveReminderMinutes(null);
    void cancelReminders().catch((error: unknown) =>
      console.warn('Could not cancel the reminders', error),
    );
    next({ reminderMinutes: undefined });
  };

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('onboarding.reminders.enable')}
            loading={enabling}
            onPress={() => void enable()}
          />
          <Button
            label={t('onboarding.reminders.skip')}
            variant="ghost"
            disabled={enabling}
            onPress={skip}
          />
        </View>
      }
    >
      <Text variant="title">{t('onboarding.steps.reminders.title')}</Text>
      <Text color="textMuted">{t('onboarding.reminders.body')}</Text>
      <CenteredContent>
        <View style={[styles.days, { gap: spacing.sm }]}>
          {sessions.map((session) => (
            <View
              key={session.weekday}
              style={[
                styles.day,
                {
                  backgroundColor: colors.iconBackground,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Text variant="bodyStrong" color="primaryText">
                {weekdayName(session.weekday)}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.wheel}>
          <WheelPicker
            values={TIMES}
            value={minutes}
            onChange={setMinutes}
            format={formatTime}
            accessibilityLabel={t('onboarding.reminders.time')}
            width={200}
          />
        </View>
      </CenteredContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  days: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  day: {
    alignItems: 'center',
  },
  wheel: {
    alignItems: 'center',
  },
});
