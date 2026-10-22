import {
  Text as NativeText,
  type TextProps as NativeTextProps,
  type TextStyle,
} from 'react-native';

import { useTheme, type ColorTokens, type TypographyVariant } from '@/theme';

export type TextProps = NativeTextProps & {
  variant?: TypographyVariant;
  color?: keyof ColorTokens;
  align?: TextStyle['textAlign'];
};

// Large text already fills the screen; letting it grow without limit with the system font size
// would push content off screen. Body text keeps growing freely.
const MAX_FONT_SCALE: Partial<Record<TypographyVariant, number>> = {
  display: 1.3,
  title: 1.4,
  button: 1.5,
};

export function Text({ variant = 'body', color = 'text', align, style, ...props }: TextProps) {
  const { colors, typography } = useTheme();
  return (
    <NativeText
      maxFontSizeMultiplier={MAX_FONT_SCALE[variant]}
      {...props}
      style={[typography[variant], { color: colors[color], textAlign: align }, style]}
    />
  );
}
