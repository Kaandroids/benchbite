import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

/** A tick box, filled in the brand colour when checked. Decorative: its row carries the role. */
export function CheckBox({ checked }: { checked: boolean }) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.box,
        {
          borderRadius: radii.sm,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : 'transparent',
        },
      ]}
    >
      {checked ? <Icon name="check" size={16} color="onPrimary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 26,
    height: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
