import { StyleSheet, TextInput, View } from 'react-native';

import { typography, useTheme } from '@/theme';

import { Icon } from './icon';

type SearchFieldProps = {
  /** Shown as the placeholder and read by screen readers. */
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Focuses the field when the screen opens, for a screen whose purpose is to search. */
  autoFocus?: boolean;
  maxLength?: number;
};

/** A text field with a magnifying glass, for searching a list on the screen. */
export function SearchField({
  label,
  value,
  onChangeText,
  autoFocus = false,
  maxLength,
}: SearchFieldProps) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View
      style={[
        styles.field,
        {
          gap: spacing.sm,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Icon name="search" size={20} color="textMuted" />
      <TextInput
        accessibilityLabel={label}
        placeholder={label}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        maxLength={maxLength}
        style={[styles.input, typography.body, { color: colors.text }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    height: '100%',
  },
});
