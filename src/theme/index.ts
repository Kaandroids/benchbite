import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './colors';
import { fonts, typography, type TypographyVariant } from './typography';
import { LEDGE_HEIGHT, radii, spacing } from './tokens';

export type ColorScheme = 'light' | 'dark';

export type Theme = {
  scheme: ColorScheme;
  colors: ColorTokens;
  typography: typeof typography;
  spacing: typeof spacing;
  radii: typeof radii;
};

const themes: Record<ColorScheme, Theme> = {
  light: { scheme: 'light', colors: lightColors, typography, spacing, radii },
  dark: { scheme: 'dark', colors: darkColors, typography, spacing, radii },
};

/** The theme for the system's current light or dark setting. */
export function useTheme(): Theme {
  return themes[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export { fonts, LEDGE_HEIGHT, radii, spacing, typography };
export type { ColorTokens, TypographyVariant };
