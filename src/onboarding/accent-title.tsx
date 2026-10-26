import { Text } from '@/components/ui/text';

/** Where the name goes in a title, left in by translating it with `{ name: NAME_SLOT }`. */
export const NAME_SLOT = '{{name}}';

type AccentTitleProps = {
  /** The translated title, its point marked `<accent>…</accent>`. */
  children: string;
  /**
   * The user's name, put into the title's `NAME_SLOT` after the markup is read, so a name is
   * always shown as it was typed, even one with `<accent>` in it.
   */
  name?: string;
};

/** A centred screen title under a stage, with its point in the brand orange. */
export function AccentTitle({ children, name }: AccentTitleProps) {
  const [before = '', rest] = children.split('<accent>');
  const [accent, after] = rest?.split('</accent>') ?? [];
  // A function, so that a `$` in the name is not read as a replacement pattern.
  const fill = (text: string) =>
    name === undefined ? text : text.replaceAll(NAME_SLOT, () => name);
  return (
    <Text variant="hero" align="center" accessibilityRole="header">
      {fill(before)}
      {accent ? (
        <Text variant="hero" color="primaryText">
          {fill(accent)}
        </Text>
      ) : null}
      {after ? fill(after) : null}
    </Text>
  );
}

/** A title without its accent markers, for screen readers. */
export function plainText(title: string) {
  return title.replaceAll('<accent>', '').replaceAll('</accent>', '');
}
