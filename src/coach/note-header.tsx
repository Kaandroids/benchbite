import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/**
 * The top of a card about a note (boards 24 and ADR 0133): the notebook's mark, or the archive's,
 * beside the card's title and a line about the note.
 */
export function NoteHeader({
  icon = 'notebook',
  title,
  caption,
}: {
  icon?: 'notebook' | 'archive';
  title: string;
  caption: string;
}) {
  const { colors, radii, spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View style={[styles.icon, { borderRadius: radii.md, backgroundColor: colors.primaryWash }]}>
        <Icon name={icon} size={18} color="primaryText" />
      </View>
      <View style={styles.flex}>
        <Text variant="label" accessibilityRole="header">
          {title}
        </Text>
        <Text variant="caption" color="textMuted">
          {caption}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  icon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
