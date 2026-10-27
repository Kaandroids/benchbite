import { Pressable, StyleSheet } from 'react-native';

import { Text } from './text';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  /** `primary` for a link to follow, `muted` for a quiet one beside a main button. */
  tone?: 'primary' | 'muted';
  /** `small` beside captions, `regular` beside body text, such as in a sentence. */
  size?: 'small' | 'regular';
  /** `start` to sit under left-aligned text, such as a field's error. */
  align?: 'center' | 'start';
};

/** A link without a button's frame, such as to the privacy policy. */
export function TextLink({
  label,
  onPress,
  tone = 'primary',
  size = 'small',
  align = 'center',
}: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.link,
        { alignSelf: align === 'start' ? 'flex-start' : 'center', opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text
        variant={size === 'small' ? 'captionStrong' : 'label'}
        color={tone === 'primary' ? 'primaryText' : 'textMuted'}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    paddingVertical: 4,
  },
});
