import { Text } from '@/components/ui/text';

/**
 * A centred screen title under a stage, from a translated text with its point marked
 * `<accent>…</accent>`, which shows in the brand orange.
 */
export function AccentTitle({ children }: { children: string }) {
  const [before, rest] = children.split('<accent>');
  const [accent, after] = rest?.split('</accent>') ?? [];
  return (
    <Text variant="hero" align="center" accessibilityRole="header">
      {before}
      {accent ? (
        <Text variant="hero" color="primaryText">
          {accent}
        </Text>
      ) : null}
      {after}
    </Text>
  );
}

/** A title without its accent markers, for screen readers. */
export function plainText(title: string) {
  return title.replaceAll('<accent>', '').replaceAll('</accent>', '');
}
