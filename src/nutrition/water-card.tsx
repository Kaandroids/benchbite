import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useLitersFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { GLASS_ML, useAddWater } from './water';

const GLASS_OUTLINE = 'M2 3h18l-2.2 22a2 2 0 0 1-2 1.8H6.2a2 2 0 0 1-2-1.8z';
const GLASS_WATER = 'M3.4 10h15.2l-1.6 15.1a1.4 1.4 0 0 1-1.4 1.3H6.4a1.4 1.4 0 0 1-1.4-1.3z';

/** A glass, filled when drunk and outlined in dashes while it is still to go. */
function Glass({ full }: { full: boolean }) {
  const { colors } = useTheme();
  return (
    <Svg width="100%" height="100%" viewBox="0 0 22 28">
      {full ? (
        <>
          {/*
           * Keyed apart from the empty outline: react-native-svg keeps a dash pattern on a path
           * that stops passing one, so a glass filled after showing empty kept its dashes.
           */}
          <Path
            key="full"
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
          key="empty"
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

/**
 * The water drunk on a day against the goal, with one glass more or less. The goal is a row of
 * glasses that fills the card's width; past it, all stay full and the caption says how much more.
 */
export function WaterCard({ day, drunk, goal }: { day: string; drunk: number; goal: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const liters = useLitersFormat();
  const addWater = useAddWater(day);

  const glasses = Math.round(goal / GLASS_ML);
  const full = Math.min(glasses, Math.floor(drunk / GLASS_ML));
  const toGo = glasses - full;

  const change = (ml: number) => {
    void Haptics.selectionAsync();
    addWater.mutate(ml);
  };

  return (
    // A notch smaller than the other cards: tighter padding and smaller glasses.
    <Card style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View
          style={[styles.tile, { borderRadius: radii.md, backgroundColor: colors.infoBackground }]}
        >
          <Icon name="water" size={20} color="info" />
        </View>
        <View style={styles.text} accessible>
          <Text variant="label">{t('nutrition.water.title')}</Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {t('nutrition.water.total', { drunk: liters(drunk), goal: liters(goal) })}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {toGo > 0
              ? t('nutrition.water.toGo', { count: toGo })
              : drunk > goal
                ? t('nutrition.water.over', { ml: drunk - goal })
                : t('nutrition.water.reached')}
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
        accessibilityValue={{ min: 0, max: glasses, now: full }}
        style={[styles.glasses, { gap: spacing.xs }]}
      >
        {Array.from({ length: glasses }, (_, index) => (
          <View
            key={index}
            testID={index < full ? 'glass-full' : 'glass-empty'}
            style={styles.glass}
          >
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
    justifyContent: 'center',
  },
  // Shares the width with the others, up to a size that keeps the card low.
  glass: {
    flex: 1,
    maxWidth: 24,
    aspectRatio: 22 / 28,
  },
});
