import type { TextStyle } from 'react-native';

/** Nunito faces loaded in the root layout. Android needs one family per weight. */
export const fonts = {
  medium: 'Nunito_500Medium',
  bold: 'Nunito_700Bold',
  extraBold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

export const typography = {
  /** Big numbers, such as the daily calorie target. */
  display: { fontFamily: fonts.black, fontSize: 40, lineHeight: 44 },
  /** Screen titles and onboarding questions. */
  title: { fontFamily: fonts.extraBold, fontSize: 28, lineHeight: 34 },
  headline: { fontFamily: fonts.extraBold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Button labels: large and bold enough for the 3:1 contrast rule on the orange button. */
  button: { fontFamily: fonts.extraBold, fontSize: 18, lineHeight: 22, letterSpacing: 0.4 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
