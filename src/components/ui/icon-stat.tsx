import { StyleSheet, View } from 'react-native';

import { fonts, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type IconStatProps = {
  icon: IconName;
  color: keyof ColorTokens;
  text: string;
  /** What screen readers say instead of the text, when the text is only a number. */
  label?: string;
};

/** A small coloured icon with a figure, such as the length or sets of a workout. */
export function IconStat({ icon, color, text, label }: IconStatProps) {
  return (
    <View style={styles.stat} accessible={!!label} accessibilityLabel={label}>
      <Icon name={icon} size={13} color={color} />
      <Text variant="caption" color="textMuted" style={styles.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  text: {
    fontFamily: fonts.bold,
  },
});
