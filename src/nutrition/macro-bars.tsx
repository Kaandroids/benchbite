import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import type { NutritionTargets } from './targets';
import { KCAL_PER_GRAM } from './targets-form';

const CHART_HEIGHT = 120;
const MAX_BAR_WIDTH = 22;
const EMPTY_HEIGHT = 3;
/** From how many bars they stand closer together. */
const MANY_BARS = 10;

/** The macros from the top of a bar down. */
const LAYERS: { key: 'fat' | 'carbs' | 'protein'; grams: keyof typeof KCAL_PER_GRAM }[] = [
  { key: 'fat', grams: 'fatG' },
  { key: 'carbs', grams: 'carbsG' },
  { key: 'protein', grams: 'proteinG' },
];

export type MacroBar = {
  key: string;
  /** What was eaten, on the day or on an average day of the span. */
  eaten: NutritionTargets;
  /** Whether anything was logged; a bar without is left empty. */
  logged: boolean;
  /** Over its target, which marks its amount in red. */
  over: boolean;
  /** What screen readers say of the bar. */
  accessibilityLabel: string;
  /** The amount above the bar and the name under it, where there is room for them. */
  amount?: string;
  label?: string;
};

type MacroBarsProps = {
  bars: readonly MacroBar[];
  /** The calories of the target, a dashed line across the bars. */
  target?: number;
};

/**
 * Days or spans of days as bars of their macros (ADR 0046): each as tall as its calories, made of
 * its protein, carbs and fat by their calories, in the macros' colours, with their legend.
 */
export function MacroBars({ bars, target }: MacroBarsProps) {
  const { t } = useTranslation();
  const { colors, spacing, radii } = useTheme();
  const tallest = Math.max(...bars.map((bar) => bar.eaten.calories), target ?? 0);
  const heightOf = (kcal: number) => (tallest > 0 ? (kcal / tallest) * CHART_HEIGHT : 0);
  const gap = bars.length >= MANY_BARS ? 2 : spacing.xs;
  const amounts = bars.some((bar) => bar.amount !== undefined);
  const labels = bars.some((bar) => bar.label !== undefined);

  return (
    <>
      <View>
        {amounts ? (
          <View style={[styles.row, { gap }]}>
            {bars.map((bar) => (
              <Text
                key={bar.key}
                color={bar.over ? 'danger' : 'textMuted'}
                style={[styles.cell, styles.amount]}
              >
                {bar.amount}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={[styles.row, styles.bars, { gap }]}>
          {bars.map((bar) => {
            const layers = LAYERS.map((layer) => ({
              ...layer,
              kcal: bar.eaten[layer.grams] * KCAL_PER_GRAM[layer.grams],
            }));
            const fromMacros = layers.reduce((sum, layer) => sum + layer.kcal, 0);
            const height = heightOf(bar.eaten.calories);
            return (
              <View
                key={bar.key}
                accessible
                accessibilityLabel={bar.accessibilityLabel}
                style={[styles.cell, styles.column]}
              >
                <View
                  style={[
                    styles.bar,
                    {
                      borderTopLeftRadius: bars.length >= MANY_BARS ? 3 : radii.sm,
                      borderTopRightRadius: bars.length >= MANY_BARS ? 3 : radii.sm,
                      height: bar.logged && height > EMPTY_HEIGHT ? height : EMPTY_HEIGHT,
                      backgroundColor: colors.track,
                    },
                  ]}
                >
                  {bar.logged && fromMacros > 0
                    ? layers.map((layer) => (
                        <View
                          key={layer.key}
                          style={{
                            flex: layer.kcal / fromMacros,
                            backgroundColor: colors[layer.key],
                          }}
                        />
                      ))
                    : null}
                </View>
              </View>
            );
          })}
          {target ? (
            <View
              pointerEvents="none"
              style={[styles.target, { top: CHART_HEIGHT - heightOf(target) - 1 }]}
            >
              <DashedLine color={colors.textMuted} />
            </View>
          ) : null}
        </View>
        {labels ? (
          <View style={[styles.row, { gap }]}>
            {bars.map((bar) => (
              <Text
                key={bar.key}
                variant="caption"
                color="textMuted"
                style={[styles.cell, styles.label]}
              >
                {bar.label}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.row, styles.legend, { gap: spacing.md }]}>
        {[...LAYERS].reverse().map((layer) => (
          <View key={layer.key} style={[styles.legendItem, { gap: spacing.xs }]}>
            <View style={[styles.swatch, { backgroundColor: colors[layer.key] }]} />
            <Text variant="caption" color="textMuted">
              {t(`nutrition.macros.${layer.key}`)}
            </Text>
          </View>
        ))}
        {target ? (
          <View style={[styles.legendItem, { gap: spacing.xs }]}>
            <View style={styles.targetSwatch}>
              <DashedLine color={colors.textMuted} />
            </View>
            <Text variant="caption" color="textMuted">
              {t('nutrition.target')}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

/** A dashed line across its parent, which Android does not draw with a one-sided border. */
function DashedLine({ color }: { color: string }) {
  return (
    <Svg width="100%" height={2}>
      <Line x1="0" x2="100%" y1="1" y2="1" stroke={color} strokeWidth={1.5} strokeDasharray="4 4" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    textAlign: 'center',
  },
  amount: {
    fontFamily: fonts.bold,
    fontSize: 10,
    lineHeight: 13,
    marginBottom: 4,
  },
  bars: {
    height: CHART_HEIGHT,
  },
  column: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    maxWidth: MAX_BAR_WIDTH,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    overflow: 'hidden',
  },
  target: {
    position: 'absolute',
    left: 0,
    right: 0,
    opacity: 0.6,
  },
  label: {
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  legend: {
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  targetSwatch: {
    width: 12,
  },
});
