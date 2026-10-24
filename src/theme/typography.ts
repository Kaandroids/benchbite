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
  /** Names and short labels that stand out, such as a list item's title. */
  label: { fontFamily: fonts.extraBold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** Small text that stands out, such as a chip or a section label. */
  captionStrong: { fontFamily: fonts.extraBold, fontSize: 13, lineHeight: 18 },
  /** Button labels: WCAG counts bold text from 18.66 px as large, which allows 3:1 contrast. */
  button: { fontFamily: fonts.extraBold, fontSize: 19, lineHeight: 24, letterSpacing: 0.4 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
