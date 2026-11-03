import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { addDays, useDayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import type { Billing, PlanPrices } from './prices';
import { TRIAL_DAYS, type TrialUsage } from './trial';
import { TrialWeek } from './trial-week';
import { PlanPicker } from './plan-picker';

type TrialEndingScreenProps = {
  /** The user's name, shown in the title when they have given one. */
  name?: string | null;
  /** The trial's first day. */
  startedOn: Date;
  /** Today's place in the trial, from 0 for its first day. */
  todayIndex: number;
  /** The days the user used Bite on, as ISO dates. */
  usedOn: readonly string[];
  /** What the user did with Bite in the trial. */
  usage: TrialUsage;
  prices: PlanPrices;
  onKeep: (billing: Billing) => void;
  onCancel: () => void;
  onClose: () => void;
};

/**
 * A reminder shortly before the free week ends (#411): a summary of the trial, its week with the
 * days left and what the user did, the plan after it, yearly or monthly, and the buttons.
 */
export function TrialEndingScreen({
  name,
  startedOn,
  todayIndex,
  usedOn,
  usage,
  prices,
  onKeep,
  onCancel,
  onClose,
}: TrialEndingScreenProps) {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const dayFormat = useDayFormat();
  const [billing, setBilling] = useState<Billing>('yearly');
  const yearly = billing === 'yearly';
  const startsOn = addDays(startedOn, TRIAL_DAYS);

  return (
    <Screen
      closes
      onBack={onClose}
      action={
        // A tag stands at the top of its row by itself; here it sits in the bar's middle.
        <View style={styles.center}>
          <Tag
            label={t('premium.trialEnding.kicker', {
              day: todayIndex + 1,
              total: TRIAL_DAYS,
            }).toLocaleUpperCase(i18n.language)}
          />
        </View>
      }
      footer={
        <View style={[styles.center, { gap: spacing.md }]}>
          <View style={styles.stretch}>
            <Button
              label={t(
                yearly ? 'premium.trialEnding.keepYearly' : 'premium.trialEnding.keepMonthly',
              )}
              onPress={() => onKeep(billing)}
            />
          </View>
          <TextLink tone="muted" label={t('premium.trialEnding.cancel')} onPress={onCancel} />
        </View>
      }
    >
      <View style={{ gap: spacing.xs }}>
        <Text variant="hero" accessibilityRole="header">
          {name ? (
            <Trans
              i18nKey="premium.trialEnding.titleNamed"
              values={{ name }}
              components={{ accent: <Text variant="hero" color="primaryText" /> }}
            />
          ) : (
            t('premium.trialEnding.title')
          )}
        </Text>
        <Text variant="body" color="textMuted">
          {t('premium.trialEnding.startsOn', { day: dayFormat(startsOn) })}
        </Text>
      </View>

      {/* What space is left goes in equal parts above and below the week. */}
      <View style={styles.flex} />

      <TrialWeek startedOn={startedOn} todayIndex={todayIndex} usedOn={usedOn} usage={usage} />

      <View style={styles.flex} />

      <PlanPicker prices={prices} billing={billing} onChange={setBilling} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
  },
});
