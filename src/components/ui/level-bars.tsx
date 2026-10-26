import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

type LevelBarsProps = {
  /** How many bars are filled, from 1. */
  value: number;
  /** How many bars there are. */
  of: number;
  /** On a filled tile, the bars take its foreground colour. */
  inverse?: boolean;
};

/** A level as rising bars, some filled, like a signal meter. Decorative. */
export function LevelBars({ value, of, inverse = false }: LevelBarsProps) {
  const { colors } = useTheme();
  const on = inverse ? colors.onPrimary : colors.primary;
  const off = inverse ? colors.onPrimary : colors.track;
  return (
    <View style={styles.bars} accessible={false}>
      {Array.from({ length: of }, (_, index) => (
        <View
          key={index}
          style={[
            styles.bar,
            {
              height: 5 + (index * 9) / Math.max(1, of - 1),
              backgroundColor: index < value ? on : off,
              opacity: inverse && index >= value ? 0.35 : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  bar: {
    width: 4,
    borderRadius: 1,
  },
});
