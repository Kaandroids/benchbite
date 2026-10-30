import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useAlternativeName, type WorkoutAlternative } from './alternatives';

type AlternativeChipsProps = {
  alternatives: WorkoutAlternative[];
  /** The one shown as in use: the one being switched to while that runs. */
  selectedId: number | undefined;
  onSelect: (alternative: WorkoutAlternative) => void;
  disabled?: boolean;
};

/**
 * A workout's alternatives as a row of name chips that scrolls sideways, the one in use filled
 * with the text colour. Tapping another puts it in use.
 */
export function AlternativeChips({
  alternatives,
  selectedId,
  onSelect,
  disabled = false,
}: AlternativeChipsProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const nameOf = useAlternativeName();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={t('workout.alternatives.title')}>
      {/* From edge to edge of the screen, past its padding, while the first chip lines up. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -spacing.xl }}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}
      >
        {alternatives.map((alternative) => {
          const selected = alternative.id === selectedId;
          return (
            <Pressable
              key={alternative.id}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => {
                if (!selected) onSelect(alternative);
              }}
              // 36 high, as the design draws it, and 44 to touch.
              hitSlop={{ top: 4, bottom: 4 }}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderRadius: radii.full,
                  paddingHorizontal: spacing.md,
                  borderColor: selected ? colors.text : colors.border,
                  backgroundColor: selected ? colors.text : colors.surface,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <Text
                variant="captionStrong"
                color={selected ? 'background' : 'textMuted'}
                numberOfLines={1}
              >
                {nameOf(alternative)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    justifyContent: 'center',
    borderWidth: 1,
  },
});
