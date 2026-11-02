import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

/**
 * The colours of each tone: orange, amber for something to check, such as an estimate, or grey for
 * a quiet label in a list.
 */
const TONES = {
  primary: { background: 'selected', text: 'primaryText' },
  warning: { background: 'warningBackground', text: 'warning' },
  neutral: { background: 'track', text: 'textMuted' },
} as const;

type TagProps = {
  label: string;
  icon?: IconName;
  tone?: keyof typeof TONES;
};

/**
 * A small label that cannot be pressed, such as a week's total or where a workout moved from, in
 * orange, or in amber for something to check.
 */
export function Tag({ label, icon, tone = 'primary' }: TagProps) {
  const { colors, radii } = useTheme();
  const { background, text } = TONES[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors[background], borderRadius: radii.full }]}>
      {icon ? <Icon name={icon} size={12} color={text} /> : null}
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
