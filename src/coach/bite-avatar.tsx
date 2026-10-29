import { StyleSheet, View } from 'react-native';

import { BRAND_ORANGE } from '@/brand/mark';

import type { BiteExpression } from './bite-expressions';
import { BiteFace, type BiteState } from './bite-face';

type BiteAvatarProps = {
  size: number;
  expression?: BiteExpression;
  state?: BiteState;
  looksAbout?: boolean;
};

/** Bite on its orange circle, the face a little smaller than the circle; see BiteFace. */
export function BiteAvatar({ size, ...face }: BiteAvatarProps) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: BRAND_ORANGE },
      ]}
    >
      <BiteFace size={Math.round(size * 0.84)} {...face} />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
