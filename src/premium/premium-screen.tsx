import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { afterSheetCloses } from '@/components/ui/sheet';
import { Sparkles } from '@/components/ui/sparkles';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

import { AccountFirstSheet } from './account-first-sheet';
import { usePlanNumbers, usePlanSummary, type PaidSummary } from './plan';
import { PlanComparison } from './plan-comparison';
import { FreeUsage, PaidUsage } from './plan-usage';
import { PlansSheet } from './plans-sheet';
import { usePurchasesSoon } from './purchases';
import { SAMPLE_PRICES } from './sample-prices';
import { STORE_NAME, SUBSCRIPTIONS_URL } from './store';

const BITE_SIZE = 80;

type Shown = 'plans' | 'account' | null;

/**
 * What premium adds (#411). On the free plan: Bite cheering, the week's meal photos, the free plan
 * beside premium and a way to try it, through an account first for a guest. On the trial or
 * premium: the plan, how much of Bite is left and where to manage it.
 */
export function PremiumScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const isAccount = useIsAccount();
  const summary = usePlanSummary();
  const numbers = usePlanNumbers();
  const restore = usePurchasesSoon();
  const [shown, setShown] = useState<Shown>(null);
  // Prices from the store come with the purchases; until then the planned ones.
  const prices = SAMPLE_PRICES;
  const paid = summary.data !== undefined && summary.data.plan !== 'free';

  const tryPremium = () => setShown(isAccount ? 'plans' : 'account');
  /** Closes the sheet, then goes on, as iOS opens nothing over a closing sheet. */
  const thenClose = (action: () => void) => () => {
    setShown(null);
    afterSheetCloses(action);
  };

  return (
    <Screen
      closes
      onBack={onClose}
      action={
        paid ? undefined : (
          <TextLink tone="muted" size="regular" label={t('premium.restore')} onPress={restore} />
        )
      }
      footer={
        summary.data && !paid ? (
          <View style={{ gap: spacing.sm }}>
            <Button label={t('premium.page.try')} onPress={tryPremium} />
            <Text variant="caption" color="textMuted" align="center">
              {t('premium.page.then', { price: prices.yearlyPerMonth })}
            </Text>
          </View>
        ) : undefined
      }
    >
      <View style={[styles.hero, { gap: spacing.xs, marginTop: -spacing.lg }]}>
        <Sparkles size={BITE_SIZE + 24}>
          <BiteAvatar size={BITE_SIZE} expression="happy" looksAbout />
        </Sparkles>
        <Text variant="title" align="center" accessibilityRole="header">
          {summary.data?.plan === 'trial'
            ? t('premium.page.titleTrial')
            : paid
              ? t('premium.page.titlePremium')
              : t('premium.page.title')}
        </Text>
        <Text color="textMuted" align="center">
          {paid ? t('premium.page.thanks') : t('premium.page.subtitle')}
        </Text>
      </View>

      <LoadState queries={[summary, numbers]} />
      {allLoaded([summary, numbers]) && summary.data && numbers.data ? (
        summary.data.plan === 'free' ? (
          <>
            {/* A guest has no meal photos until they have an account. */}
            {isAccount ? <FreeUsage photos={summary.data.photos} /> : null}
            <PlanComparison free={numbers.data.free} premium={numbers.data.premium} />
          </>
        ) : (
          <Paid summary={summary.data} onChangePlan={() => setShown('plans')} />
        )
      ) : null}

      {shown === 'plans' ? (
        <PlansSheet
          prices={prices}
          trial={summary.data?.plan === 'free'}
          onClose={() => setShown(null)}
        />
      ) : null}
      {shown === 'account' ? (
        <AccountFirstSheet
          onCreate={thenClose(() => router.push('/account/create'))}
          onLogIn={thenClose(() => router.push('/account/login'))}
          onClose={() => setShown(null)}
        />
      ) : null}
    </Screen>
  );
}

/** The trial's or premium's plan, how much of Bite is left, and where to change or cancel it. */
function Paid({ summary, onChangePlan }: { summary: PaidSummary; onChangePlan: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const restore = usePurchasesSoon();
  const rows = [
    {
      label: t('premium.mine.changePlan'),
      value: t(summary.billing === 'yearly' ? 'premium.mine.yearly' : 'premium.mine.monthly'),
      onPress: onChangePlan,
    },
    {
      label: t('premium.mine.manage'),
      value: STORE_NAME,
      onPress: () => void Linking.openURL(SUBSCRIPTIONS_URL),
    },
    { label: t('premium.restore'), value: '', onPress: restore },
  ];
  return (
    <>
      <PaidUsage summary={summary} />
      <Card list>
        {rows.map((row, index) => (
          <Pressable
            key={row.label}
            accessibilityRole="button"
            accessibilityLabel={row.value ? `${row.label}, ${row.value}` : row.label}
            onPress={row.onPress}
            style={({ pressed }) => [
              styles.row,
              { minHeight: 54, gap: spacing.md, opacity: pressed ? 0.6 : 1 },
              listDivider(index === 0, colors.border),
            ]}
          >
            <Text variant="bodyStrong" style={styles.flex}>
              {row.label}
            </Text>
            <Text variant="caption" color="textMuted">
              {row.value}
            </Text>
            <Icon name="forward" size={16} color="textMuted" />
          </Pressable>
        ))}
      </Card>
      <Text variant="caption" color="textMuted">
        {t('premium.mine.cancelNote', { store: STORE_NAME })}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
