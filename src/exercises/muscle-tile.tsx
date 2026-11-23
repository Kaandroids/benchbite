import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Database } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { MuscleMap } from './muscle-map';

type Muscle = Database['public']['Enums']['muscle'];

type MuscleTileProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  size: number;
  /** Shown in its place when no muscle is known, as for a workout without exercises. */
  fallback: ReactNode;
};

const BORDER = 1;
const PADDING = 3;

/**
 * The body from the front and the back side by side, in a square, with the muscles a workout trains
 * (#304). Small, so it shows the whole figure: a workout trains more than one part of the body.
 */
export function MuscleTile({ primary, secondary, size, fallback }: MuscleTileProps) {
  const { colors, radii } = useTheme();
  if (primary.length === 0) {
    return fallback;
  }
  const inner = size - 2 * BORDER - 2 * PADDING;
  return (
    <View
      testID="muscle-tile"
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          padding: PADDING,
          borderWidth: BORDER,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      {(['front', 'back'] as const).map((side) => (
        <MuscleMap
          key={side}
          primary={primary}
          secondary={secondary}
          side={side}
          width={inner / 2}
          height={inner}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
    overflow: 'hidden',
  },
});
