import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Body from 'react-native-body-highlighter';

import type { Database } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { mapParts, placement, type MapSide, type MapZone } from './body-map';

type Muscle = Database['public']['Enums']['muscle'];

type MuscleMapProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
  side: MapSide;
  /** The part of the figure to show; the whole figure by default. */
  zone?: MapZone;
  width: number;
  height: number;
};

/**
 * The body from the front or the back, with the muscles an exercise trains first in the brand
 * colour and the ones that help in a paler one. It is a picture: what it shows is said in words
 * beside it, so screen readers pass over it.
 */
export const MuscleMap = memo(function MuscleMap({
  primary,
  secondary,
  side,
  zone = 'whole',
  width,
  height,
}: MuscleMapProps) {
  const { colors } = useTheme();
  const parts = useMemo(
    () =>
      mapParts(primary, secondary, {
        primary: colors.primary,
        secondary: colors.figureSecondary,
        rest: colors.figure,
      }),
    [primary, secondary, colors.primary, colors.figureSecondary, colors.figure],
  );
  const { scale, left, top } = placement(zone, width, height);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.frame, { width, height }]}
    >
      <View style={[styles.figure, { left, top }]}>
        <Body data={parts} side={side} scale={scale} gender="male" border="none" />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
  },
  figure: {
    position: 'absolute',
  },
});
