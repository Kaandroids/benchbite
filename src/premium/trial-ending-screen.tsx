import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useMonthDayFormat, useMonthFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import type { Billing, PlanPrices } from './prices';

type TrialEndingScreenProps = {
  /** The day the trial ends and the paid plan starts. */
  endsOn: Date;
  /** Whole days until then. */
  daysLeft: number;
  /** What the user did with Bite in the trial. */
  usage: { chats: number; photos: number; reviews: number };
  prices: PlanPrices;
  onKeep: (billing: Billing) => void;
  onCancel: () => void;
  onClose: () => void;
};

/**
 * A reminder shortly before the free week ends (#411): Bite and the day on top, then the plan and
 * its one price, yearly or monthly, with what the trial gave, and the buttons at the bottom.
 */
export function TrialEndingScreen({
  endsOn,
  daysLeft,
  usage,
  prices,
  onKeep,
  onCancel,
  onClose,
}: TrialEndingScreenProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const monthDay = useMonthDayFormat();
  const month = useMonthFormat();
  const [billing, setBilling] = useState<Billing>('yearly');
  const yearly = billing === 'yearly';
  const date = monthDay(endsOn);

  return (
    <Screen
      closes
      onBack={onClose}
      footer={
        <View style={[styles.stretch, { gap: spacing.md }]}>
          <Button
            label={t(yearly ? 'premium.trialEnding.keepYearly' : 'premium.trialEnding.keepMonthly')}
            onPress={() => onKeep(billing)}
          />
          <TextLink tone="muted" label={t('premium.trialEnding.cancel')} onPress={onCancel} />
        </View>
      }
    >
      <View style={[styles.body, { gap: spacing.xl }]}>
        <View style={[styles.group, { gap: spacing.md }]}>
          <View>
            <BiteAvatar size={128} expression="thinking" />
            <View
              accessible
              accessibilityLabel={date}
              style={[
                styles.calendar,
                {
                  borderColor: colors.text,
                  backgroundColor: colors.surface,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <Text
                variant="captionStrong"
                color="background"
                style={[styles.month, { backgroundColor: colors.text }]}
              >
                {month(endsOn).toUpperCase()}
              </Text>
              <Text variant="headline" style={styles.center}>
                {endsOn.getDate()}
              </Text>
            </View>
          </View>
          <Text variant="title" style={styles.center}>
            {t('premium.trialEnding.title', { count: daysLeft })}
          </Text>
        </View>

        <View style={[styles.group, { gap: spacing.lg }]}>
          <View style={styles.stretch}>
            <SegmentedControl
              accessibilityLabel={t('premium.billing')}
              value={billing}
              onChange={setBilling}
              options={[
                {
                  value: 'yearly',
                  label: t('premium.yearlySave', { percent: prices.yearlySavePercent }),
                },
                { value: 'monthly', label: t('premium.monthly') },
              ]}
            />
          </View>
          <View style={styles.group}>
            <Text variant="display">{yearly ? prices.yearly : prices.monthly}</Text>
            <Text variant="label">
              {t(yearly ? 'premium.perYearFrom' : 'premium.perMonthFrom', { date })}
            </Text>
            <Text variant="caption" color="textMuted">
              {yearly
                ? t('premium.yearlyPerMonth', { price: prices.yearlyPerMonth })
                : t('premium.cancelAnytime')}
            </Text>
          </View>
          <View style={[styles.stats, { gap: spacing.sm }]}>
            {(
              [
                ['chats', usage.chats],
                ['photos', usage.photos],
                ['reviews', usage.reviews],
              ] as const
            ).map(([kind, count]) => (
              <View
                key={kind}
                style={[
                  styles.stat,
                  { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm },
                ]}
              >
                <Text variant="headline">{count}</Text>
                <Text variant="caption" color="textMuted" style={styles.center}>
                  {t(`premium.trialEnding.${kind}`, { count })}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  group: {
    alignItems: 'center',
  },
  calendar: {
    position: 'absolute',
    left: -24,
    top: 72,
    width: 56,
    borderWidth: 2,
    overflow: 'hidden',
  },
  month: {
    textAlign: 'center',
  },
  center: {
    textAlign: 'center',
  },
  stats: {
    flexDirection: 'row',
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
});
