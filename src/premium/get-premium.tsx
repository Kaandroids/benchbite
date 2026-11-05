import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { closeThen } from '@/components/ui/sheet';
import { Sparkles } from '@/components/ui/sparkles';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { AccountFirstSheet } from './account-first-sheet';
import type { FreeSummary } from './plan';
import { PlansSheet } from './plans-sheet';
import { usePurchasesSoon } from './purchases';
import { SAMPLE_PRICES } from './sample-prices';
import { TRIAL_DAYS } from './trial';

/** Bite cheering over a page's title and what it says under it, at the top of a premium page. */
export function PremiumHero({
  size,
  title,
  subtitle,
}: {
  size: number;
  title: string;
  subtitle: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.hero, { gap: spacing.xs, marginTop: -spacing.lg }]}>
      <Sparkles size={size + 24}>
        <BiteAvatar size={size} expression="happy" looksAbout />
      </Sparkles>
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text color="textMuted" align="center">
        {subtitle}
      </Text>
    </View>
  );
}

/** Restores a purchase, at the top of a page that offers premium. */
export function RestoreLink() {
  const { t } = useTranslation();
  const restore = usePurchasesSoon();
  return <TextLink tone="muted" size="regular" label={t('premium.restore')} onPress={restore} />;
}

/**
 * The way to premium at the foot of a page, on the free plan: to the plans, through an account
 * first for a guest, trying it free for a user who has not had the trial.
 */
export function GetPremiumFooter({ free }: { free: FreeSummary }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [shown, setShown] = useState<'plans' | 'account' | null>(null);
  // Prices from the store come with the purchases; until then the planned ones.
  const prices = SAMPLE_PRICES;
  // The trial is offered once, to a user who has not had it.
  const trial = !free.hadTrial;
  const close = () => setShown(null);

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        label={trial ? t('premium.page.try', { count: TRIAL_DAYS }) : t('premium.page.get')}
        onPress={() => setShown(free.accountRequired ? 'account' : 'plans')}
      />
      <Text variant="caption" color="textMuted" align="center">
        {t(trial ? 'premium.page.then' : 'premium.page.from', { price: prices.yearlyPerMonth })}
      </Text>
      {shown === 'plans' ? <PlansSheet prices={prices} trial={trial} onClose={close} /> : null}
      {shown === 'account' ? (
        <AccountFirstSheet
          onCreate={closeThen(close, () => router.push('/account/create'))}
          onLogIn={closeThen(close, () => router.push('/account/login'))}
          onClose={close}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
});
