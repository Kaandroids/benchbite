import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Card, CardDivider } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';

import { MACROS } from './macro-targets';
import type { Totals } from './meals';
import type { NutritionTargets } from './targets';

const RING = 96;
const STROKE = 10;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type DaySummaryProps = {
  /** Across the top, such as the day it sums up and the way to another. */
  header: ReactNode;
  /** Null while the day loads, or before there are targets: the card holds its header only. */
  totals: { targets: NutritionTargets; eaten: Totals } | null;
};

/**
 * A day's summary: its header, then the calories left as a ring, and the protein, carbs and fat
 * eaten against their targets.
 */
export function DaySummary({ header, totals }: DaySummaryProps) {
  return (
    <Card>
      {header}
      {totals ? (
        <>
          <CardDivider />
          <DayTotals {...totals} />
        </>
      ) : null}
    </Card>
  );
}

function DayTotals({ targets, eaten }: { targets: NutritionTargets; eaten: Totals }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const left = Math.round(targets.calories - eaten.calories);
  const share = targets.calories > 0 ? clamp(eaten.calories / targets.calories, 0, 1) : 0;

  return (
    <View style={[styles.row, { gap: spacing.lg }]}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('nutrition.ringLabel', {
          eaten: format(Math.round(eaten.calories)),
          target: format(targets.calories),
        })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(share * 100) }}
        style={styles.ring}
      >
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke={colors.track}
            strokeWidth={STROKE}
          />
          {share > 0 ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              stroke={left < 0 ? colors.warning : colors.primary}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${share * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          ) : null}
        </Svg>
        <View style={styles.center}>
          <Text variant="headline">{format(Math.abs(left))}</Text>
          <Text variant="caption" color="textMuted">
            {left < 0 ? t('nutrition.over') : t('nutrition.left')}
          </Text>
        </View>
      </View>
      <View style={[styles.macros, { gap: spacing.sm }]}>
        {MACROS.map(({ key, grams, color }) => (
          <View key={key} style={{ gap: spacing.xs }}>
            <View style={styles.macroLine}>
              <Text variant="captionStrong" color="textMuted">
                {t(`nutrition.macros.${key}`)}
              </Text>
              <Text variant="captionStrong">
                {format(Math.round(eaten[grams]))}{' '}
                {t('nutrition.gramTarget', { target: format(targets[grams]) })}
              </Text>
            </View>
            <ProgressBar
              value={targets[grams] > 0 ? eaten[grams] / targets[grams] : 0}
              color={color}
              size="thin"
              accessibilityLabel={t(`nutrition.macros.${key}`)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ring: {
    width: RING,
    height: RING,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macros: {
    flex: 1,
  },
  macroLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
