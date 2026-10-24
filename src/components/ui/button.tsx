import { ActivityIndicator, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { RaisedPressable } from './raised-pressable';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** A small button fits in a row beside text. */
  size?: 'regular' | 'small';
  disabled?: boolean;
  /** Shows a spinner and ignores presses, for example while a request is running. */
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

type VariantColors = {
  face: string;
  ledge?: string;
  border?: string;
  label: keyof ColorTokens;
};

function variantColors(
  variant: ButtonVariant,
  inactive: boolean,
  colors: ColorTokens,
): VariantColors {
  if (inactive && variant !== 'ghost') {
    return { face: colors.track, label: 'textMuted' };
  }
  switch (variant) {
    case 'primary':
      return { face: colors.primaryButton, ledge: colors.primaryButtonLedge, label: 'onPrimary' };
    case 'secondary':
      return { face: colors.surface, ledge: colors.border, border: colors.border, label: 'text' };
    case 'ghost':
      return { face: 'transparent', label: inactive ? 'textMuted' : 'primaryText' };
  }
}

// Labels are written in sentence case rather than transformed to upper case, because automatic
// upper-casing gets Turkish wrong (i becomes I instead of İ).
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled = false,
  loading = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { colors, radii, spacing } = useTheme();
  const { face, ledge, border, label: labelColor } = variantColors(variant, disabled, colors);

  return (
    <RaisedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      haptic="impact"
      ledgeColor={ledge}
      borderRadius={radii.lg}
      style={style}
      faceStyle={[
        size === 'small' ? styles.small : styles.face,
        { backgroundColor: face, paddingHorizontal: size === 'small' ? spacing.md : spacing.xl },
        border ? { borderWidth: 2, borderColor: border } : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[labelColor]} />
      ) : (
        <Text
          variant={size === 'small' ? 'bodyStrong' : 'button'}
          color={labelColor}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </RaisedPressable>
  );
}

const styles = StyleSheet.create({
  face: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
