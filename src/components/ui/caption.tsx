import type { ComponentProps } from 'react';

import { useUpperCase } from '@/i18n/case';

import { Text } from './text';

type CaptionProps = Pick<ComponentProps<typeof Text>, 'accessibilityRole' | 'style'> & {
  children: string;
  /** Muted by default; the brand colour for a label that marks a step forward. */
  color?: 'textMuted' | 'primaryText';
};

/** A small label in capitals over a card's content or a section, such as "YOUR WORKOUT". */
export function Caption({ children, color = 'textMuted', ...props }: CaptionProps) {
  const upperCase = useUpperCase();
  return (
    <Text variant="captionStrong" color={color} {...props}>
      {upperCase(children)}
    </Text>
  );
}
