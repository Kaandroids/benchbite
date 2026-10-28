import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** A check mark in a round badge that springs in, for something done, such as a finished flow. */
export function SuccessBadge() {
  const { colors } = useTheme();
  return (
    <Animated.View entering={ZoomIn.springify().delay(100)}>
      <View style={[styles.badge, { backgroundColor: colors.primary }]}>
        <Icon name="check" size={40} color="onPrimary" />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
