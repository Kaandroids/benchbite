import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme, type ColorTokens } from '@/theme';

import { MacroDot } from './macro-dot';
import type { NutritionTargets } from './targets';

/** The macros in their usual order, with the target each one reads and its colour. */
export const MACROS: {
  key: 'protein' | 'carbs' | 'fat';
  grams: keyof NutritionTargets;
  color: keyof ColorTokens;
}[] = [
  { key: 'protein', grams: 'proteinG', color: 'protein' },
  { key: 'carbs', grams: 'carbsG', color: 'carbs' },
  { key: 'fat', grams: 'fatG', color: 'fat' },
];

/** The daily calories, with the protein, carbs and fat in grams below them. */
export function MacroTargets({ targets }: { targets: NutritionTargets }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  return (
    <>
      <Text variant="title" color="primaryText">
        {t('nutrition.calories', { calories: format(targets.calories) })}
      </Text>
      <View style={[styles.macros, { gap: spacing.sm }]}>
        {MACROS.map(({ key, grams, color }) => (
          <View
            key={key}
            style={[
              styles.macro,
              { borderRadius: radii.md, backgroundColor: colors.track, padding: spacing.md },
            ]}
          >
            <View style={styles.dotSpace}>
              <MacroDot color={color} size={10} />
            </View>
            <Text variant="bodyStrong">{t('nutrition.grams', { count: targets[grams] })}</Text>
            <Text variant="caption" color="textMuted">
              {t(`nutrition.macros.${key}`)}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flex: 1,
    gap: 2,
  },
  dotSpace: {
    marginBottom: 4,
  },
});
