import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { BiteSheet } from '@/coach/bite-sheet';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { PRIVACY_POLICY_URL } from '@/lib/links';
import { ThemeScheme, useTheme } from '@/theme';

import { usePurchasesSoon } from './purchases';
import { PlanPicker } from './plan-picker';
import type { Billing, PlanPrices } from './prices';
import { TRIAL_DAYS } from './trial';

/** What is due and when it renews, by whether the trial comes first and how it is billed. */
const TERMS = {
  'trial-yearly': 'premium.plans.termsTrialYearly',
  'trial-monthly': 'premium.plans.termsTrialMonthly',
  'paid-yearly': 'premium.plans.termsYearly',
  'paid-monthly': 'premium.plans.termsMonthly',
} as const;

type PlansSheetProps = {
  prices: PlanPrices;
  /** False for a user who has had their trial, who starts premium straight away. */
  trial: boolean;
  onClose: () => void;
};

/**
 * The plans to choose from after the premium page (#411): yearly or monthly, what is due and when
 * it renews, with Bite over the corner. Always dark, as it stands apart from the page under it.
 * The purchase stays inactive until the purchases are built.
 */
export function PlansSheet(props: PlansSheetProps) {
  return (
    <ThemeScheme scheme="dark">
      <Plans {...props} />
    </ThemeScheme>
  );
}

function Plans({ prices, trial, onClose }: PlansSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [billing, setBilling] = useState<Billing>('yearly');
  const restore = usePurchasesSoon();
  const price = billing === 'yearly' ? prices.yearly : prices.monthly;

  return (
    <BiteSheet
      title={t(trial ? 'premium.plans.titleTrial' : 'premium.plans.title')}
      body={trial ? t('premium.plans.trialThen', { count: TRIAL_DAYS }) : t('premium.plans.body')}
      onClose={onClose}
    >
      <PlanPicker prices={prices} billing={billing} onChange={setBilling} />
      <View style={{ gap: spacing.sm }}>
        <Button
          label={
            trial ? t('premium.plans.startTrial', { count: TRIAL_DAYS }) : t('premium.plans.start')
          }
          disabled
        />
        <Text variant="captionStrong" color="primaryText" align="center">
          {t('premium.plans.soon')}
        </Text>
      </View>
      <Text variant="caption" color="textMuted" align="center">
        {t(TERMS[`${trial ? 'trial' : 'paid'}-${billing}`], { count: TRIAL_DAYS, price })}
      </Text>
      <View style={[styles.links, { gap: spacing.lg }]}>
        <TextLink tone="muted" label={t('premium.restore')} onPress={restore} />
        <TextLink
          tone="muted"
          label={t('premium.plans.privacy')}
          onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
        />
      </View>
    </BiteSheet>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
