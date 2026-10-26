import { Pressable, StyleSheet } from 'react-native';

import { Text } from './text';

type TextLinkProps = {
  label: string;
  onPress: () => void;
  /** `primary` for a link to follow, `muted` for a quiet one beside a main button. */
  tone?: 'primary' | 'muted';
};

/** A small link on its own line, such as to the privacy policy. */
export function TextLink({ label, onPress, tone = 'primary' }: TextLinkProps) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Text variant="captionStrong" color={tone === 'primary' ? 'primaryText' : 'textMuted'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    alignSelf: 'center',
    paddingVertical: 4,
  },
});
