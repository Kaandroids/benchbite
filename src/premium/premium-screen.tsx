import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { GetPremiumFooter, PremiumHero, RestoreLink } from './get-premium';
import { BILLING_LABEL, usePlanNumbers, usePlanSummary, type PaidSummary } from './plan';
import { PlanComparison } from './plan-comparison';
import { FreeUsage, PaidUsage } from './plan-usage';
import { PlansSheet } from './plans-sheet';
import { usePurchasesSoon } from './purchases';
import { SAMPLE_PRICES } from './sample-prices';
import { STORE_NAME, SUBSCRIPTIONS_URL } from './store';

const BITE_SIZE = 80;

/**
 * What premium adds (#411). On the free plan: Bite cheering, the week's meal photos, the free plan
 * beside premium and a way to try it, through an account first for a guest. On the trial or
 * premium: the plan, how much of Bite is left and where to manage it.
 */
export function PremiumScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const summary = usePlanSummary();
  const numbers = usePlanNumbers();
  const restore = usePurchasesSoon();
  // A paid user changing plan, which starts from the one they are on.
  const [changing, setChanging] = useState(false);
  const free = summary.data?.plan === 'free' ? summary.data : null;
  const paid = summary.data?.plan === 'free' ? null : (summary.data ?? null);

  return (
    <Screen
      closes
      onBack={onClose}
      action={paid ? undefined : <RestoreLink />}
      footer={free ? <GetPremiumFooter free={free} /> : undefined}
    >
      <PremiumHero
        size={BITE_SIZE}
        title={
          paid
            ? t(paid.plan === 'trial' ? 'premium.page.titleTrial' : 'premium.page.titlePremium')
            : t('premium.page.title')
        }
        subtitle={paid ? t('premium.page.thanks') : t('premium.page.subtitle')}
      />

      <LoadState queries={[summary, numbers]} />
      {allLoaded([summary, numbers]) && numbers.data ? (
        free ? (
          <>
            {/* A guest has no meal photos until they have an account. */}
            {free.accountRequired ? null : <FreeUsage photos={free.photos} />}
            <PlanComparison free={numbers.data.free} premium={numbers.data.premium} />
          </>
        ) : paid ? (
          <Paid summary={paid} onChangePlan={() => setChanging(true)} onRestore={restore} />
        ) : null
      ) : null}

      {changing && paid ? (
        <PlansSheet
          prices={SAMPLE_PRICES}
          trial={false}
          initialBilling={paid.billing}
          onClose={() => setChanging(false)}
        />
      ) : null}
    </Screen>
  );
}

/** The trial's or premium's plan, how much of Bite is left, and where to change or cancel it. */
function Paid({
  summary,
  onChangePlan,
  onRestore,
}: {
  summary: PaidSummary;
  onChangePlan: () => void;
  onRestore: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const rows = [
    {
      label: t('premium.mine.changePlan'),
      value: t(BILLING_LABEL[summary.billing]),
      onPress: onChangePlan,
    },
    {
      label: t('premium.mine.manage'),
      value: STORE_NAME,
      onPress: () => void Linking.openURL(SUBSCRIPTIONS_URL),
    },
    { label: t('premium.restore'), value: '', onPress: onRestore },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
