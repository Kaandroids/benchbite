import { StyleSheet } from 'react-native';

import { fonts, typography, useTheme } from '@/theme';
import { useUpperCase } from '@/i18n/case';

import { Text } from './text';

/** A field's small upper-case label, with a star when the field is required. */
export function FieldLabel({ text, required = false }: { text: string; required?: boolean }) {
  const upperCase = useUpperCase();
  return (
    <Text variant="caption" color="textMuted" style={styles.label}>
      {upperCase(text)}
      {required ? ' *' : ''}
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
