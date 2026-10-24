import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type TagProps = {
  label: string;
  icon?: IconName;
};

/** A small orange label that cannot be pressed, such as a week's total or where a workout moved from. */
export function Tag({ label, icon }: TagProps) {
  const { colors, radii } = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: colors.selected, borderRadius: radii.full }]}>
      {icon ? <Icon name={icon} size={12} color="primaryText" /> : null}
      <Text variant="captionStrong" color="primaryText">
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
