import { Text } from './text';

/** How far a long title alone may shrink to fit on one line: to the size it has with a subtitle. */
const MIN_ALONE_SCALE = 16 / 20;

/**
 * The title in the middle of a screen's top bar. On its own it is the screen's one heading, so it
 * is larger; with a short line under it, both are smaller to fit beside the buttons.
 */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  if (!subtitle) {
    return (
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={MIN_ALONE_SCALE}
      >
        {title}
      </Text>
    );
  }
  return (
    <>
      <Text variant="label" accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {subtitle}
      </Text>
    </>
  );
}
