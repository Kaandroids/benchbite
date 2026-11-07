import { Pressable, StyleSheet } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  /**
   * `primary` for a link to follow, `muted` for a quiet one beside a main button, `danger` for one
   * that goes on to delete.
   */
  tone?: keyof typeof TONES;
  /** `small` beside captions, `regular` beside body text, such as in a sentence. */
  size?: 'small' | 'regular';
  /** `start` to sit under left-aligned text, such as a field's error; `end` under a field's end. */
  align?: 'center' | 'start' | 'end';
  /** A small icon before the label, in its colour. */
  icon?: IconName;
  /** Dims the link and ignores presses, as while what it does is running. */
  disabled?: boolean;
};

const TONES = { primary: 'primaryText', muted: 'textMuted', danger: 'danger' } as const;
const ALIGN_SELF = { center: 'center', start: 'flex-start', end: 'flex-end' } as const;

/** Reaches past the label to a touch target at least 44 points high, as the guidelines ask. */
const HIT_SLOP = { top: 10, bottom: 10, left: 8, right: 8 };

/** A link without a button's frame, such as to the privacy policy. */
export function TextLink({
  label,
  onPress,
  tone = 'primary',
  size = 'small',
  align = 'center',
  icon,
  disabled = false,
}: TextLinkProps) {
  const color = TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        {
          alignSelf: ALIGN_SELF[align],
          opacity: pressed || disabled ? 0.6 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'small' ? 14 : 16} color={color} /> : null}
      <Text variant={size === 'small' ? 'captionStrong' : 'label'} color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
});
