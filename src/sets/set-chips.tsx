import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type SetChipsProps = {
  /** Each set as short text, such as "80 × 8", and in full for screen readers when it differs. */
  sets: { text: string; spoken?: string }[];
  /** The sets to stand out, such as the best one or a record, by their index. */
  marked: (index: number) => boolean;
  /** Read before a marked set, such as "Best" or "Record". */
  markLabel: string;
  style?: StyleProp<ViewStyle>;
};

/** The sets of an exercise as small chips that wrap, the marked ones in orange. */
export function SetChips({ sets, marked, markLabel, style }: SetChipsProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={[styles.chips, { gap: spacing.xs }, style]}>
      {sets.map(({ text, spoken }, index) => {
        const isMarked = marked(index);
        return (
          <View
            key={index}
            accessibilityLabel={isMarked ? `${markLabel}: ${spoken ?? text}` : undefined}
            style={[
              styles.chip,
              {
                borderRadius: radii.md,
                backgroundColor: isMarked ? colors.selected : colors.background,
              },
            ]}
          >
            <Text
              variant="captionStrong"
              color={isMarked ? 'primaryText' : 'text'}
              style={styles.tabular}
            >
              {text}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
