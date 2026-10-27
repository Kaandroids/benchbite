import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { GLASS_ML, useAddWater, useWater, useWaterGoal } from './water';

const GLASS_OUTLINE = 'M2 3h18l-2.2 22a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.8z';
const GLASS_WATER = 'M3.4 10h15.2l-1.6 15.1a1.4 1.4 0 0 1-1.4 1.3H6.4a1.4 1.4 0 0 1-1.4-1.3z';

/** A glass, filled when drunk and outlined in dashes while it is still to go. */
function Glass({ full }: { full: boolean }) {
  const { colors } = useTheme();
  return (
    <Svg width={22} height={28} viewBox="0 0 22 28">
      {full ? (
        <>
          <Path
            d={GLASS_OUTLINE}
            fill={colors.infoBackground}
            stroke={colors.info}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <Path d={GLASS_WATER} fill={colors.info} />
        </>
      ) : (
        <Path
          d={GLASS_OUTLINE}
          fill="none"
          stroke={colors.placeholder}
          strokeWidth={2}
          strokeDasharray="3 3"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}

/** The water drunk on a day against the goal, as glasses, with one more or one less. */
export function WaterCard({ day }: { day: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const water = useWater(day);
  const goal = useWaterGoal();
  const addWater = useAddWater(day);

  const drunk = water.data ?? 0;
  const goalMl = goal.data ?? 0;
  const glasses = Math.round(goalMl / GLASS_ML);
  const full = Math.floor(drunk / GLASS_ML);
  const toGo = Math.max(0, glasses - full);
  const liters = (ml: number) => format(ml / 1000, { maximumFractionDigits: 2 });

  if (water.data === undefined || goal.data === undefined) {
    return null;
  }

  const change = (ml: number) => {
    void Haptics.selectionAsync();
    addWater.mutate(ml);
  };

  return (
    <Card>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View
          style={[styles.tile, { borderRadius: radii.md, backgroundColor: colors.infoBackground }]}
        >
          <Icon name="water" size={20} color="info" />
        </View>
        <View style={styles.text} accessible>
          <Text variant="label">{t('nutrition.water.title')}</Text>
          <Text variant="caption" color="textMuted">
            {t('nutrition.water.total', { drunk: liters(drunk), goal: liters(goalMl) })} ·{' '}
            {toGo > 0 ? t('nutrition.water.toGo', { count: toGo }) : t('nutrition.water.reached')}
          </Text>
        </View>
        <RoundIconButton
          icon="minus"
          color="text"
          background="track"
          size={40}
          label={t('nutrition.water.remove')}
          onPress={() => change(-GLASS_ML)}
          disabled={drunk === 0}
        />
        <RoundIconButton
          icon="plus"
          color="onPrimary"
          background="info"
          size={40}
          label={t('nutrition.water.add', { ml: GLASS_ML })}
          onPress={() => change(GLASS_ML)}
        />
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('nutrition.water.title')}
        accessibilityValue={{ min: 0, max: glasses, now: Math.min(full, glasses) }}
        style={[styles.glasses, { rowGap: spacing.sm }]}
      >
        {Array.from({ length: Math.max(glasses, full) }, (_, index) => (
          <View key={index} style={styles.glass}>
            <Glass full={index < full} />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  glasses: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Eight to a row, as a goal of 2 L fills one.
  glass: {
    width: '12.5%',
    alignItems: 'center',
  },
});
