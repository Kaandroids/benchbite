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
  /** The user's messages to Bite: a quiet grey beside Bite's cards, with `onUserBubble` text. */
  userBubble: string;
  onUserBubble: string;
  /** Background of a selected card. */
  selected: string;
  /** Background of the icon tile on an unselected card. */
  iconBackground: string;
  /** A faint wash of the brand colour behind a picture, which cards stand out from. */
  primaryWash: string;
  success: string;
  warning: string;
  danger: string;
  /** Behind a note that warns before an action, with `text` and a `warning` icon on it. */
  warningBackground: string;
  /** Behind an error message, with `text` and a `danger` icon on it. */
  dangerBackground: string;
  /**
   * Teal, so that protein never reads as the orange of calories and buttons, beside the yellow
   * carbs and purple fat. At least 3:1 on `surface` in both themes.
   */
  protein: string;
  carbs: string;
  fat: string;
  /**
   * Each meal's own colour for its icon and its + button, on its background, so that the meals
   * read apart and not every action is orange. At least 3:1 on their backgrounds in both themes.
   * Lunch keeps the brand colour.
   */
  breakfast: string;
  breakfastBackground: string;
  lunch: string;
  lunchBackground: string;
  dinner: string;
  dinnerBackground: string;
  snack: string;
  snackBackground: string;
  /** Water's glasses, icon and + button, on `waterBackground`, apart from the meals. */
  water: string;
  waterBackground: string;
  /** Text and icons of frozen streak days, on `frozenBackground`. */
  frozen: string;
  frozenBackground: string;
  /** A workout planned for today or later, lighter than a finished one. */
  planned: string;
  /**
   * The shades of the training heat map, from a short day to a long one, over `track` for a day
   * without a workout. Each one stands apart from the next in lightness.
   */
  heat1: string;
  heat2: string;
  heat3: string;
  heat4: string;
  /** Behind exercise pictures, which are drawn on white, in both themes. */
  imageBackground: string;
  /** The thumb of on/off switches. */
  switchThumb: string;
  /** Dims the screen behind a sheet. */
  scrim: string;
  /** The "i" that opens an exercise's details, on `infoBackground`. */
  info: string;
  infoBackground: string;
  /**
   * A dark surface that stands out in both themes, such as the rest bar and the workout in
   * progress, with what sits on it.
   */
  inverseSurface: string;
  inverseRaised: string;
  inverseTrack: string;
  onInverse: string;
  onInverseMuted: string;
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
  userBubble: '#ECEDF0',
  onUserBubble: '#16171A', // 14.9:1 on userBubble
  selected: '#FFF2E9',
  iconBackground: '#FFEDE2',
  primaryWash: 'rgba(255, 106, 16, 0.1)',
  success: '#15803D',
  warning: '#B45309',
  danger: '#DC2626',
  warningBackground: '#FEF3C7',
  dangerBackground: '#FEE2E2',
  protein: '#0E9384', // 3.8:1 on surface
  carbs: '#B98000', // 3.4:1 on surface; the brighter #F5B800 had 1.8:1
  fat: '#6E5BD8',
  breakfast: '#B45309', // 4.5:1 on breakfastBackground
  breakfastBackground: '#FEF3C7',
  lunch: '#E05300', // 3.4:1 on lunchBackground
  lunchBackground: '#FFEDE2',
  dinner: '#4F5FD0', // 4.6:1 on dinnerBackground
  dinnerBackground: '#E8EBFB',
  snack: '#C2346F', // 4.4:1 on snackBackground
  snackBackground: '#FCE7F0',
  water: '#1F8A86', // 3.7:1 on waterBackground
  waterBackground: '#E1F4F2',
  frozen: '#1D4ED8', // 5.5:1 on frozenBackground
  frozenBackground: '#DBEAFE',
  planned: '#FFC9A8',
  heat1: '#FFC9A8',
  heat2: '#FB8A4C',
  heat3: '#F25A00',
  heat4: '#C24800',
  imageBackground: '#FFFFFF',
  switchThumb: '#FFFFFF',
  scrim: 'rgba(22, 23, 26, 0.45)',
  info: '#4F83E0',
  infoBackground: '#EAF1FD',
  inverseSurface: '#16171A',
  inverseRaised: '#2A2C31',
  inverseTrack: '#3A3C42',
  onInverse: '#FFFFFF',
  onInverseMuted: '#C9CBD1', // 11.1:1 on inverseSurface
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
  userBubble: '#2A2C31',
  onUserBubble: '#F2F3F5', // 12.6:1 on userBubble
  selected: '#24262B',
  iconBackground: '#2A2C31',
  primaryWash: 'rgba(255, 127, 38, 0.1)',
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  warningBackground: '#2E2410',
  dangerBackground: '#3A1C1C',
  protein: '#2DD4BF', // 9.2:1 on surface
  carbs: '#FFD23F',
  fat: '#9F8CFF',
  breakfast: '#F5B54A', // 7.5:1 on breakfastBackground
  breakfastBackground: '#3A2C14',
  lunch: '#FF7F26', // 5.8:1 on lunchBackground
  lunchBackground: '#3A2416',
  dinner: '#9AA6F5', // 6.1:1 on dinnerBackground
  dinnerBackground: '#232A4D',
  snack: '#F28AB7', // 6.3:1 on snackBackground
  snackBackground: '#3D1F2D',
  water: '#4FD1C5', // 7.1:1 on waterBackground
  waterBackground: '#173533',
  frozen: '#93C5FD', // 6.4:1 on frozenBackground
  frozenBackground: '#1E3A5F',
  planned: '#A8561C',
  heat1: '#5C3418',
  heat2: '#8F4A17',
  heat3: '#D45A00',
  heat4: '#FF8A3D',
  imageBackground: '#FFFFFF',
  switchThumb: '#FFFFFF',
  scrim: 'rgba(0, 0, 0, 0.6)',
  info: '#86AEE0',
  infoBackground: '#1C2C40',
  inverseSurface: '#16171A',
  inverseRaised: '#2A2C31',
  inverseTrack: '#3A3C42',
  onInverse: '#FFFFFF',
  onInverseMuted: '#C9CBD1', // 11.1:1 on inverseSurface
};
