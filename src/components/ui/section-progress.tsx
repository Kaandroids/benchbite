import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';

import { Text } from './text';

export type SectionProgressProps = {
  /** The name of each section, in order. */
  sections: readonly string[];
  /** The index of the section the user is in. */
  current: number;
  /** How far the user is in the current section, between 0 and 1. */
  value: number;
};

/**
 * Progress through a flow made of named sections, such as the onboarding: a short bar per section
 * with its name below. Sections before the current one are full, those after it empty.
 */
export function SectionProgress({ sections, current, value }: SectionProgressProps) {
  const { spacing } = useTheme();
  const clamped = clamp(value, 0, 1);
  const overall = sections.length > 0 ? (current + clamped) / sections.length : 0;

  return (
    <View
      // Without it, iOS does not read the bar.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={sections[current]}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(overall * 100) }}
      style={[styles.row, { gap: spacing.sm }]}
    >
      {sections.map((label, index) => (
        <View key={label} style={[styles.section, { gap: spacing.xs }]}>
          <Segment value={index < current ? 1 : index === current ? clamped : 0} />
          <Text
            variant="captionStrong"
            color={index === current ? 'primaryText' : 'textMuted'}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Segment({ value }: { value: number }) {
  const { colors, radii } = useTheme();
  const progress = useSharedValue(value);

  useEffect(() => {
    progress.set(withTiming(value, { duration: 350 }));
  }, [value, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  return (
    <View style={[styles.track, { backgroundColor: colors.track, borderRadius: radii.full }]}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: colors.primary, borderRadius: radii.full },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  section: {
    flex: 1,
  },
  track: {
    height: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});
