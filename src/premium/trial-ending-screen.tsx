import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Radio } from '@/components/ui/radio';
import { Screen } from '@/components/ui/screen';
import { Tag } from '@/components/ui/tag';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { addDays, useDayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import type { Billing, PlanPrices } from './prices';
import { TRIAL_DAYS, TrialWeek } from './trial-week';

type TrialEndingScreenProps = {
  /** The trial's first day. */
  startedOn: Date;
  /** Today's place in the trial, from 0 for its first day. */
  todayIndex: number;
  /** The days the user used Bite on, as ISO dates. */
  usedOn: readonly string[];
  /** What the user did with Bite in the trial. */
  usage: { chats: number; photos: number; reviews: number };
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
  const { colors, spacing } = useTheme();
  const dayFormat = useDayFormat();
  const [billing, setBilling] = useState<Billing>('yearly');
  const yearly = billing === 'yearly';
  const startsOn = addDays(startedOn, TRIAL_DAYS);

  const plans = [
    {
      value: 'yearly',
      name: t('premium.yearlySave', { percent: prices.yearlySavePercent }),
      note: t('premium.trialEnding.yearlyNote', { price: prices.yearlyPerMonth }),
      price: prices.yearly,
    },
    {
      value: 'monthly',
      name: t('premium.monthly'),
      note: t('premium.cancelAnytime'),
      price: prices.monthly,
    },
  ] as const;

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
          <View style={[styles.row, { gap: spacing.xs }]}>
            <Icon name="check" size={14} color="textMuted" />
            <Text variant="caption" color="textMuted">
              {t('premium.trialEnding.kept')}
            </Text>
          </View>
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
          {t('premium.trialEnding.title')}
        </Text>
        <Text variant="body" color="textMuted">
          {t('premium.trialEnding.startsOn', { day: dayFormat(startsOn) })}
        </Text>
      </View>

      <TrialWeek startedOn={startedOn} todayIndex={todayIndex} usedOn={usedOn} usage={usage} />

      <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
        {plans.map((plan) => {
          const checked = billing === plan.value;
          return (
            <Pressable
              key={plan.value}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => setBilling(plan.value)}
              style={[
                styles.row,
                styles.plan,
                {
                  gap: spacing.md,
                  padding: spacing.md,
                  backgroundColor: colors.surface,
                  borderColor: checked ? colors.primary : colors.border,
                  borderWidth: checked ? 2 : 1,
                },
              ]}
            >
              <Radio checked={checked} />
              <View style={styles.flex}>
                <Text variant="label">{plan.name}</Text>
                <Text variant="caption" color="textMuted">
                  {plan.note}
                </Text>
              </View>
              <Text variant="headline">{plan.price}</Text>
              {plan.value === 'yearly' ? (
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.inverseSurface, paddingHorizontal: spacing.sm },
                  ]}
                >
                  <Text variant="captionStrong" color="onInverse">
                    {t('premium.bestValue').toLocaleUpperCase(i18n.language)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stretch: {
    alignSelf: 'stretch',
  },
  flex: {
    flex: 1,
  },
  plan: {
    borderRadius: 18,
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 14,
    borderRadius: 999,
  },
});
