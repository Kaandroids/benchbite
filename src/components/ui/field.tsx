import { StyleSheet } from 'react-native';

import { fonts, typography, useTheme } from '@/theme';

import { Text } from './text';

/** A field's small upper-case label. */
export function FieldLabel({ text }: { text: string }) {
  return (
    <Text variant="caption" color="textMuted" style={styles.label}>
      {text.toLocaleUpperCase()}
    </Text>
  );
}

/** The look of a form's text inputs. */
export function useFieldStyle() {
  const { colors, radii, spacing } = useTheme();
  return [
    styles.field,
    typography.body,
    {
      borderRadius: radii.md,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: spacing.md,
    },
  ];
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.extraBold,
    letterSpacing: 0.4,
  },
  field: {
    minHeight: 52,
    borderWidth: 1.5,
  },
});
