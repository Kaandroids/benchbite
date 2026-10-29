import { StyleSheet, View } from 'react-native';

import { BRAND_ORANGE } from '@/brand/mark';

import { BiteFace } from './bite-face';

/** Bite on its orange circle, the face a little smaller than the circle; see BiteFace for `idle`. */
export function BiteAvatar({ size, idle = false }: { size: number; idle?: boolean }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: BRAND_ORANGE },
      ]}
    >
      <BiteFace size={Math.round(size * 0.84)} idle={idle} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
