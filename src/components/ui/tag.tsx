import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

/**
 * The colours of each tone: orange, amber for something to check, such as an estimate, grey for
 * a quiet label in a list, or blue for a device that takes part, with a blue icon only, as blue
 * text would not stand out enough on it.
 */
const TONES = {
  primary: { background: 'selected', text: 'primaryText', icon: 'primaryText' },
  warning: { background: 'warningBackground', text: 'warning', icon: 'warning' },
  neutral: { background: 'track', text: 'textMuted', icon: 'textMuted' },
  info: { background: 'infoBackground', text: 'text', icon: 'info' },
} as const;

type TagProps = {
  label: string;
  icon?: IconName;
  tone?: keyof typeof TONES;
  /** What a screen reader says in place of the label, when the label alone says too little. */
  accessibilityLabel?: string;
};

/**
 * A small label that cannot be pressed, such as a week's total or where a workout moved from, in
 * orange, or in amber for something to check.
 */
export function Tag({ label, icon, tone = 'primary', accessibilityLabel }: TagProps) {
  const { colors, radii } = useTheme();
  const { background, text, icon: iconColor } = TONES[tone];
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[styles.tag, { backgroundColor: colors[background], borderRadius: radii.full }]}
    >
      {icon ? <Icon name={icon} size={12} color={iconColor} /> : null}
      <Text variant="captionStrong" color={text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
});
