import { StyleSheet, View } from 'react-native';

import { BRAND_ORANGE } from '@/brand/mark';

import { BiteFace } from './bite-face';

/** Bite on its orange circle, the face a little smaller than the circle. */
export function BiteAvatar({ size }: { size: number }) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: BRAND_ORANGE },
      ]}
    >
      <BiteFace size={Math.round(size * 0.84)} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
