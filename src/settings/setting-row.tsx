import { Pressable, StyleSheet } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type SettingRowProps = {
  label: string;
  /** The current setting, after the label; nothing when there is none. */
  value?: string | null;
  /** What pressing the row does, for screen readers. */
  hint: string;
  onPress: () => void;
};

/** A setting in a row with its current value, which opens where it is changed. */
export function SettingRow({ label, value, hint, onPress }: SettingRowProps) {
  const { spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Card style={[styles.row, { gap: spacing.md }]}>
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
        {value ? (
          <Text variant="bodyStrong" color="textMuted" numberOfLines={1} style={styles.value}>
            {value}
          </Text>
        ) : null}
        <Icon name="forward" size={18} color="textMuted" />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The label pushes the value to the end; a long value shrinks before the label does.
  label: {
    flexGrow: 1,
    flexShrink: 0,
  },
  value: {
    flexShrink: 1,
  },
});
