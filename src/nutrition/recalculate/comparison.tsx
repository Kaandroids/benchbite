import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { MacroDot } from '../macro-dot';
import { MACROS } from '../macro-targets';
import { type NutritionTargets } from '../targets';
import { Was } from './was';

/** The new targets, each beside the one in use now when it changes. */
export function Comparison({ from, to }: { from: NutritionTargets; to: NutritionTargets }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();

  const value = (was: number, now: number, large: boolean) => {
    const unit = large ? 'kcal' : 'g';
    return {
      label:
        was === now
          ? `${format(now)} ${unit}`
          : t('nutrition.recalculate.done.change', { from: format(was), to: format(now), unit }),
      node: (
        <Text variant="label">
          {was !== now ? <Was value={format(was)} variant="bodyStrong" /> : null}
          <Text variant={large ? 'headline' : 'label'} color={large ? 'primaryText' : 'text'}>
            {format(now)}{' '}
          </Text>
          <Text variant="bodyStrong" color="textMuted">
            {unit}
          </Text>
        </Text>
      ),
    };
  };

  const rows: { key: string; name: ReactNode; label: string; value: ReturnType<typeof value> }[] = [
    {
      key: 'calories',
      name: <Text variant="label">{t('nutrition.goals.calories')}</Text>,
      label: t('nutrition.goals.calories'),
      value: value(from.calories, to.calories, true),
    },
    ...MACROS.map(({ key, grams, color }) => ({
      key,
      name: (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <MacroDot color={color} />
          <Text variant="label">{t(`nutrition.macros.${key}`)}</Text>
        </View>
      ),
      label: t(`nutrition.macros.${key}`),
      value: value(from[grams], to[grams], false),
    })),
  ];

  return (
    <Card list>
      {rows.map((row, index) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={`${row.label}: ${row.value.label}`}
          style={[
            styles.row,
            styles.between,
            { paddingVertical: spacing.md },
            listDivider(index === 0, colors.border),
          ]}
        >
          {row.name}
          {row.value.node}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
});
