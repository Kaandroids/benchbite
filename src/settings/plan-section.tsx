import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useMonthDayFormat } from '@/i18n/dates';
import { useOpenPremium } from '@/premium/open-premium';
import { BILLING_LABEL, usePlanSummary, type PlanSummary } from '@/premium/plan';
import { TRIAL_DAYS } from '@/premium/trial';
import { useTheme } from '@/theme';

const BITE_SIZE = 48;

/**
 * The user's plan at the top of the settings (#411), which opens the premium page: on the free
 * plan, with a way to premium; on the trial or premium, how it is billed and when it renews or
 * ends. Nothing until the plan has loaded.
 */
export function PlanSection() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const summary = usePlanSummary();
  const openPremium = useOpenPremium();
  const { title, note } = usePlanLines(summary.data);
  if (!summary.data) {
    return null;
  }
  const free = summary.data.plan === 'free';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, note].filter(Boolean).join(', ')}
      accessibilityHint={t('settings.plan.hint')}
      onPress={openPremium}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Card style={[styles.row, { gap: spacing.md }]}>
        <BiteAvatar size={BITE_SIZE} />
        <View style={styles.flex}>
          <Text variant="label">{title}</Text>
          {note ? (
            <Text variant="caption" color="textMuted">
              {note}
            </Text>
          ) : null}
        </View>
        {free ? (
          <View
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radii.full,
              backgroundColor: colors.primaryButton,
            }}
          >
            <Text variant="captionStrong" color="onPrimary">
              {t('settings.plan.premium')}
            </Text>
          </View>
        ) : (
          <Icon name="forward" size={18} color="textMuted" />
        )}
      </Card>
    </Pressable>
  );
}

/** The plan's name, and a line under it: what premium offers, or when the plan renews or ends. */
function usePlanLines(summary: PlanSummary | undefined) {
  const { t } = useTranslation();
  const monthDay = useMonthDayFormat();
  if (!summary) {
    return { title: '', note: null };
  }
  if (summary.plan === 'free') {
    return {
      title: t('settings.plan.free'),
      // The trial is offered once.
      note: summary.hadTrial
        ? t('settings.plan.more')
        : t('settings.plan.tryFree', { count: TRIAL_DAYS }),
    };
  }
  const trial = summary.plan === 'trial';
  const when = summary.renewsAt
    ? t(trial ? 'premium.mine.ends' : 'premium.mine.renews', { day: monthDay(summary.renewsAt) })
    : null;
  return {
    title: t(trial ? 'settings.plan.trial' : 'settings.plan.premium'),
    note: [t(BILLING_LABEL[summary.billing]), when].filter(Boolean).join(' · '),
  };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
