import { Text } from './text';

/** The title in the middle of a screen's top bar, with a short line under it if any. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <Text variant="label" accessibilityRole="header" numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}
