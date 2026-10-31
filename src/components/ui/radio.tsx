import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

/**
 * The mark of a choice among several: a ring, filled with a dot when checked. Only the mark; the
 * row it stands in has the radio role and the checked state.
 */
export function Radio({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.ring, { borderColor: checked ? colors.primary : colors.border }]}>
      {checked ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
