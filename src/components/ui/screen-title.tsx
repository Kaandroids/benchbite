import { Platform } from 'react-native';

import { typography } from '@/theme';

import { Text } from './text';

/** How far a long title alone may shrink to fit: to the size it has with a subtitle. */
const MIN_ALONE_SCALE = typography.label.fontSize / typography.headline.fontSize;

/**
 * The longest title Android shrinks to fit. It reads no lower limit, so a longer one, such as a
 * long recipe name, would shrink below the label size; it ends in an ellipsis instead. iOS keeps to
 * the limit above, so it shrinks any title.
 */
const ANDROID_SHRINKS_UP_TO = 30;

type ScreenTitleProps = {
  title: string;
  subtitle?: string;
  /** Lines a title alone may take, for a name that should not be cut short, as an exercise's. */
  lines?: number;
};

/**
 * The title in the middle of a screen's top bar. On its own it is the screen's one heading, so it
 * is larger; with a short line under it, both are smaller to fit beside the buttons.
 */
export function ScreenTitle({ title, subtitle, lines = 1 }: ScreenTitleProps) {
  if (!subtitle) {
    return (
      <Text
        variant="headline"
        accessibilityRole="header"
        align="center"
        numberOfLines={lines}
        adjustsFontSizeToFit={Platform.OS === 'ios' || title.length <= ANDROID_SHRINKS_UP_TO}
        minimumFontScale={MIN_ALONE_SCALE}
      >
        {title}
      </Text>
    );
  }
  return (
    <>
      <Text variant="label" accessibilityRole="header" align="center" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="caption" color="textMuted" align="center" numberOfLines={1}>
        {subtitle}
      </Text>
    </>
  );
}
