import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

const SIZE = 64;
/** How far Bite stands above the sheet's top edge, the rest of it over the sheet's corner. */
const PEEK = 44;

/** The room text beside Bite keeps free, so that it never runs under Bite. */
export const BITE_PEEK_ROOM = SIZE;

/**
 * Bite looking over the top right corner of a sheet (#416), ringed in the sheet's colour so that
 * it stands out from what is behind. Placed as the sheet's first child; screen readers skip it.
 */
export function BitePeek() {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.peek,
        { top: -PEEK, right: spacing.xl, borderRadius: SIZE, borderColor: colors.background },
      ]}
    >
      <BiteAvatar size={SIZE} looksAbout />
    </View>
  );
}

const styles = StyleSheet.create({
  peek: {
    position: 'absolute',
    borderWidth: 4,
  },
});
