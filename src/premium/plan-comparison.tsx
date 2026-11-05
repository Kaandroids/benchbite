import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import type { PlanNumbers } from './plan';

const FREE_WIDTH = 64;
const PREMIUM_WIDTH = 80;

/** What a plan gives of a row: included or not, or how much, such as "3". */
type Cell = boolean | string;

/**
 * The free plan beside premium, a row for each difference: Bite's chat and reviews, meal photos,
 * workouts, alternatives and the archive, and the logging both keep. Premium's column is tinted, and its values
 * stand out.
 */
export function PlanComparison({ free, premium }: { free: PlanNumbers; premium: PlanNumbers }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const count = (value: number | null, label: (n: number) => string): Cell =>
    value === null ? t('premium.compare.noLimit') : label(value);

  const rows: { label: string; free: Cell; premium: Cell }[] = [
    { label: t('premium.compare.chat'), free: false, premium: true },
    { label: t('premium.compare.reviews'), free: false, premium: true },
    {
      label: t('premium.compare.photos'),
      free: count(free.weeklyPhotos, (n) => t('premium.compare.perWeek', { count: n })),
      premium: t('premium.compare.daily'),
    },
    {
      label: t('premium.compare.workouts'),
      free: count(free.workouts, String),
      premium: count(premium.workouts, String),
    },
    {
      label: t('premium.compare.alternatives'),
      free: count(free.addedAlternatives, (n) => t('premium.compare.inAll', { count: n })),
      premium: count(premium.versions, (n) => t('premium.compare.each', { count: n })),
    },
    { label: t('premium.compare.archive'), free: false, premium: true },
    { label: t('premium.compare.logging'), free: true, premium: true },
  ];

  const describe = (value: Cell) =>
    typeof value === 'string'
      ? value
      : t(value ? 'premium.compare.included' : 'premium.compare.notIncluded');

  const cell = (value: Cell, strong: boolean) =>
    typeof value === 'string' ? (
      <Text
        variant={strong ? 'bodyStrong' : 'caption'}
        color={strong ? 'text' : 'textMuted'}
        align="center"
      >
        {value}
      </Text>
    ) : value ? (
      <View accessible accessibilityLabel={t('premium.compare.included')}>
        <Icon name="check" size={18} color={strong ? 'primaryText' : 'textMuted'} />
      </View>
    ) : (
      <Text
        color="placeholder"
        variant="bodyStrong"
        align="center"
        accessibilityLabel={t('premium.compare.notIncluded')}
      >
        –
      </Text>
    );

  return (
    <Card style={[styles.card, { paddingHorizontal: 0, paddingVertical: spacing.xs }]}>
      {/* Premium's column, behind its cells. */}
      <View
        style={[
          styles.tint,
          {
            top: spacing.xs,
            bottom: spacing.xs,
            right: spacing.xs,
            borderRadius: radii.md,
            backgroundColor: colors.selected,
          },
        ]}
      />
      <View style={[styles.row, { paddingLeft: spacing.lg, paddingRight: spacing.xs }]}>
        <View style={styles.label} />
        <View style={[styles.free, styles.center]}>
          <Caption>{t('premium.compare.free')}</Caption>
        </View>
        <View style={[styles.premium, styles.center]}>
          <Caption color="primaryText">{t('premium.compare.premium')}</Caption>
        </View>
      </View>
      {rows.map((row) => (
        <View
          key={row.label}
          accessible
          accessibilityLabel={t('premium.compare.rowLabel', {
            label: row.label,
            free: describe(row.free),
            premium: describe(row.premium),
          })}
          style={[
            styles.row,
            { minHeight: 40, paddingLeft: spacing.lg, paddingRight: spacing.xs, gap: spacing.xs },
          ]}
        >
          <Text variant="bodyStrong" style={styles.label}>
            {row.label}
          </Text>
          <View style={[styles.free, styles.center]}>{cell(row.free, false)}</View>
          <View style={[styles.premium, styles.center]}>{cell(row.premium, true)}</View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 0,
  },
  tint: {
    position: 'absolute',
    width: PREMIUM_WIDTH,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  free: {
    width: FREE_WIDTH,
  },
  premium: {
    width: PREMIUM_WIDTH,
  },
  center: {
    alignItems: 'center',
  },
});
