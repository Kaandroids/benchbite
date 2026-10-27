import { StyleSheet, View } from 'react-native';

import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';

import { ProgressBar } from './progress-bar';
import { Text } from './text';

export type SectionProgressProps = {
  /** The name of each section, in order. */
  sections: readonly string[];
  /** The index of the section the user is in. */
  current: number;
  /** How far the user is in the current section, between 0 and 1. */
  value: number;
  /**
   * How far the user is through the whole flow, between 0 and 1, which screen readers announce.
   * Sections can differ in length, so it is not derived from the bars.
   */
  overall: number;
};

/**
 * Progress through a flow made of named sections, such as the onboarding: a short bar per section
 * with its name below. Sections before the current one are full, those after it empty.
 */
export function SectionProgress({ sections, current, value, overall }: SectionProgressProps) {
  const { spacing } = useTheme();
  const clamped = clamp(value, 0, 1);

  return (
    <View
      // Without it, iOS does not read the bar.
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={sections[current]}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(overall, 0, 1) * 100) }}
      style={[styles.row, { gap: spacing.sm }]}
    >
      {sections.map((label, index) => (
        <View key={label} style={[styles.section, { gap: spacing.xs }]}>
          <ProgressBar
            value={index < current ? 1 : index === current ? clamped : 0}
            size="thin"
            accessible={false}
          />
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  section: {
    flex: 1,
  },
});
