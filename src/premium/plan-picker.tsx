import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Radio } from '@/components/ui/radio';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import type { Billing, PlanPrices } from './prices';

type PlanPickerProps = {
  prices: PlanPrices;
  billing: Billing;
  onChange: (billing: Billing) => void;
  /** What the yearly plan's row says under its name, such as its price a month. */
  yearlyNote: string;
  /** The yearly plan's badge: dark on a light screen, orange on a dark one. */
  badge?: 'inverse' | 'primary';
};

/** The yearly and the monthly plan as two rows to choose from, the yearly one marked best value. */
export function PlanPicker({
  prices,
  billing,
  onChange,
  yearlyNote,
  badge = 'inverse',
}: PlanPickerProps) {
  const { t, i18n } = useTranslation();
  const { colors, spacing } = useTheme();
  const plans = [
    {
      value: 'yearly',
      name: t('premium.yearlySave', { percent: prices.yearlySavePercent }),
      note: yearlyNote,
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
    <View accessibilityRole="radiogroup" style={{ gap: spacing.sm }}>
      {plans.map((plan) => {
        const checked = billing === plan.value;
        return (
          <Pressable
            key={plan.value}
            accessibilityRole="radio"
            accessibilityState={{ checked }}
            onPress={() => onChange(plan.value)}
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
                  {
                    backgroundColor: badge === 'primary' ? colors.primary : colors.inverseSurface,
                    paddingHorizontal: spacing.sm,
                  },
                ]}
              >
                <Text
                  variant="captionStrong"
                  color={badge === 'primary' ? 'onPrimary' : 'onInverse'}
                >
                  {t('premium.bestValue').toLocaleUpperCase(i18n.language)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
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
