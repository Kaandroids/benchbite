import { StyleSheet } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { defaultUnits, useNumberFormat, useWeightLabel } from '@/i18n/units';
import type { Streak } from '@/streak/streak';
import { useTheme } from '@/theme';

// What the onboarding's pictures of the app share: example data, none of it the user's, and the
// pieces they are drawn with.

/** A weight in both units, each rounded the way it is lifted or weighed. */
export type ExampleWeight = { kg: number; lb: number };

/** The streak the pictures show. */
export const EXAMPLE_STREAK: Streak = { count: 12, doneToday: true, days: {} };

/** Delay between the parts of a picture appearing. */
export const STEP_MS = 180;

/**
 * Formats an example weight in the device's default unit, with the unit after it: a pair in the
 * unit's own rounding, or kilograms, converted.
 */
export function useExampleWeight() {
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const unit = defaultUnits().weight;
  return (weight: ExampleWeight | number) =>
    typeof weight === 'number' ? weightLabel(weight, unit) : `${format(weight[unit])} ${unit}`;
}

type SceneNoteProps = {
  children: string;
  icon?: IconName;
  /** When it slides in, once the rest of the picture has played. */
  delay: number;
};

/** A tinted note at the bottom of a picture, such as the weight lost. */
export function SceneNote({ children, icon, delay }: SceneNoteProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay(delay)}
      style={[
        styles.note,
        {
          gap: spacing.sm,
          borderRadius: radii.md,
          backgroundColor: colors.selected,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color="primary" /> : null}
      <Text variant="captionStrong" color="primaryText">
        {children}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
