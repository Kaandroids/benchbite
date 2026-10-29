import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

import type { MarkedState } from './streak';

/**
 * A day's mark for the streak (ADR 0042): a flame when it counted, a snowflake when it was frozen,
 * and a flame struck through in grey when it was missed, apart from the orange of the streak.
 */
export function StreakMark({ state, size }: { state: MarkedState; size: number }) {
  const { colors } = useTheme();
  if (state === 'missed') {
    return (
      <View style={{ width: size, height: size }}>
        <Icon name="flame" size={size} color="textMuted" />
        <View
          style={[
            styles.strike,
            {
              width: size * 1.3,
              left: -size * 0.15,
              top: size / 2 - 0.75,
              backgroundColor: colors.textMuted,
            },
          ]}
        />
      </View>
    );
  }
  return (
    <Icon
      name={state === 'done' ? 'flame' : 'snowflake'}
      size={size}
      color={state === 'done' ? 'primary' : 'frozen'}
    />
  );
}

const styles = StyleSheet.create({
  strike: {
    position: 'absolute',
    height: 1.5,
    transform: [{ rotate: '45deg' }],
  },
});
