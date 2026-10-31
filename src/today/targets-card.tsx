import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { DayTotals } from '@/nutrition/day-totals';
import { MACROS } from '@/nutrition/macro-targets';
import type { Totals } from '@/nutrition/meals';
import type { NutritionTargets } from '@/nutrition/targets';
import { useTheme } from '@/theme';

type TargetsCardProps = {
  /** How the card comes in, from the screen that places it. */
  entering?: CardProps['entering'];
  targets: NutritionTargets;
  eaten: Totals;
  /** The day the card sums up, as YYYY-MM-DD: the one Nutrition opens on. */
  day: string;
};

/**
 * Today's calories and macros against the targets, as Nutrition shows them. The whole card opens
 * Nutrition on the same day.
 */
export function TargetsCard({ entering, targets, eaten, day }: TargetsCardProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const macroLabels = Object.fromEntries(
    MACROS.map(({ key, grams }) => [
      key,
      t('nutrition.macroLabel', {
        macro: t(`nutrition.macros.${key}`),
        eaten: format(Math.round(eaten[grams])),
        target: format(targets[grams]),
      }),
    ]),
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('today.targetsLabel', {
        eaten: format(Math.round(eaten.calories)),
        target: format(targets.calories),
        ...macroLabels,
      })}
      accessibilityHint={t('today.targetsOpen')}
      // A new navigation each time, so that Nutrition opens on this day even if it shows another.
      onPress={() =>
        router.navigate({ pathname: '/nutrition', params: { day, at: String(Date.now()) } })
      }
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card entering={entering}>
        <View style={[styles.header, { gap: spacing.sm }]}>
          <Text variant="label" style={styles.title}>
            {t('today.targets')}
          </Text>
          <View style={styles.link}>
            <Text variant="captionStrong" color="textMuted">
              {t('tabs.nutrition')}
            </Text>
            <Icon name="forward" size={16} color="textMuted" />
          </View>
        </View>
        {/* The card reads the totals as its label. */}
        <DayTotals targets={targets} eaten={eaten} accessible={false} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
