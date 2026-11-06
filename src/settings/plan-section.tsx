import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import {
  usePlanSummary,
  type FreeSummary,
  type PaidSummary,
  type PlanSummary,
} from '@/premium/plan';
import { usePaidTerms } from '@/premium/plan-usage';
import { TRIAL_DAYS } from '@/premium/trial';
import { useTheme } from '@/theme';

const BITE_SIZE = 44;

/**
 * The user's plan as a row of the account's card (#411), which opens the premium page. Nothing
 * shows until the plan has loaded.
 */
export function PlanSection() {
  const summary = usePlanSummary();
  return summary.data ? <PlanCard summary={summary.data} /> : null;
}

/**
 * On the free plan, a way to premium; on the trial or premium, how it is billed and when it renews
 * or ends.
 */
function PlanCard({ summary }: { summary: PlanSummary }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const openPremium = useOpenPremium();
  const free = summary.plan === 'free';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('settings.plan.hint')}
      onPress={openPremium}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          paddingVertical: spacing.lg,
          opacity: pressed ? 0.6 : 1,
          ...listDivider(false, colors.border),
        },
      ]}
    >
      <BiteAvatar size={BITE_SIZE} />
      {free ? <FreeLines summary={summary} /> : <PaidLines summary={summary} />}
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
            {t('premium.mine.premium')}
          </Text>
        </View>
      ) : (
        <Icon name="forward" size={18} color="textMuted" />
      )}
    </Pressable>
  );
}

function FreeLines({ summary }: { summary: FreeSummary }) {
  const { t } = useTranslation();
  return (
    <Lines
      title={t('settings.plan.free')}
      // The trial is offered once.
      note={
        summary.hadTrial
          ? t('settings.plan.more')
          : t('settings.plan.tryFree', { count: TRIAL_DAYS })
      }
    />
  );
}

function PaidLines({ summary }: { summary: PaidSummary }) {
  const { t } = useTranslation();
  const { billing, when } = usePaidTerms(summary);
  return (
    <Lines
      title={t(summary.plan === 'trial' ? 'settings.plan.trial' : 'premium.mine.premium')}
      note={[billing, when].filter(Boolean).join(' · ')}
    />
  );
}

/** The plan's name, and a line under it. */
function Lines({ title, note }: { title: string; note: string }) {
  return (
    <View style={styles.flex}>
      <Text variant="label">{title}</Text>
      <Text variant="caption" color="textMuted">
        {note}
      </Text>
    </View>
  );
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
