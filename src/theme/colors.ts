/**
 * Colour tokens. Components refer to these names and never to raw values, so light and dark mode
 * stay in sync. Contrast ratios are WCAG 2.1 against the token's usual background.
 */
export type ColorTokens = {
  background: string;
  surface: string;
  /** A surface raised above `track`, such as the selected segment of a segmented control. */
  elevated: string;
  text: string;
  textMuted: string;
  /** A hint in an empty field that stands in for a value, fainter than any value typed. */
  placeholder: string;
  border: string;
  /** Unfilled part of progress bars and sliders, inactive segments. */
  track: string;
  /** Brand orange for fills, icons and selected states. Not for text on light backgrounds. */
  primary: string;
  /** Orange text on `background` or `surface`, at least 4.5:1. */
  primaryText: string;
  /** Face of filled buttons, at least 3:1 with `onPrimary` for large bold labels. */
  primaryButton: string;
  /** The ledge below a filled button that the face presses down onto. */
  primaryButtonLedge: string;
  onPrimary: string;
  /** Background of a selected card. */
  selected: string;
  /** Background of the icon tile on an unselected card. */
  iconBackground: string;
  success: string;
  warning: string;
  danger: string;
  protein: string;
  carbs: string;
  fat: string;
  /** Text and icons of frozen streak days, on `frozenBackground`. */
  frozen: string;
  frozenBackground: string;
  /** A workout planned for today or later, lighter than a finished one. */
  planned: string;
  /** Behind exercise pictures, which are drawn on white, in both themes. */
  imageBackground: string;
  /** The thumb of on/off switches. */
  switchThumb: string;
  /** Dims the screen behind a sheet. */
  scrim: string;
  /** The "i" that opens an exercise's details, on `infoBackground`. */
  info: string;
  infoBackground: string;
};

export const lightColors: ColorTokens = {
  background: '#F6F6F8',
  surface: '#FFFFFF',
  elevated: '#FFFFFF',
  text: '#16171A', // 16.6:1 on background
  textMuted: '#676A72', // 5.0:1 on background
  placeholder: '#B4B6BC',
  border: '#E3E4E8',
  track: '#ECEDF0',
  primary: '#E05300', // 3.4:1 on iconBackground, the lowest of its pairs
  primaryText: '#C2410C', // 4.8:1 on background
  primaryButton: '#F25A00', // 3.4:1 with white
  primaryButtonLedge: '#C24800',
  onPrimary: '#FFFFFF',
  selected: '#FFF2E9',
  iconBackground: '#FFEDE2',
  success: '#15803D',
  warning: '#B45309',
  danger: '#DC2626',
  protein: '#FF6A10',
  carbs: '#F5B800',
  fat: '#6E5BD8',
  frozen: '#1D4ED8', // 5.5:1 on frozenBackground
  frozenBackground: '#DBEAFE',
  planned: '#FFC9A8',
  imageBackground: '#FFFFFF',
  switchThumb: '#FFFFFF',
  scrim: 'rgba(22, 23, 26, 0.45)',
  info: '#4F83E0',
  infoBackground: '#EAF1FD',
};

// Orange tints over a dark surface turn brown, so selection in dark mode is carried by the orange
// border and a lighter neutral surface instead.
export const darkColors: ColorTokens = {
  background: '#111214',
  surface: '#1B1C1F',
  elevated: '#3A3C42',
  text: '#F2F3F5', // 16.9:1 on background
  textMuted: '#9A9DA5', // 6.9:1 on background
  placeholder: '#5C5F66',
  border: '#2B2D31',
  track: '#25272B',
  primary: '#FF7F26',
  primaryText: '#FF7F26', // 7.4:1 on background
  primaryButton: '#FF7F26', // 7.6:1 with onPrimary
  primaryButtonLedge: '#D45A00',
  onPrimary: '#1C0C00',
  selected: '#24262B',
  iconBackground: '#2A2C31',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  protein: '#FF7F26',
  carbs: '#FFD23F',
  fat: '#9F8CFF',
  frozen: '#93C5FD', // 6.4:1 on frozenBackground
  frozenBackground: '#1E3A5F',
  planned: '#A8561C',
  imageBackground: '#FFFFFF',
  switchThumb: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.6)',
  info: '#86AEE0',
  infoBackground: '#1C2C40',
};
