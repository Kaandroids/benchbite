import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Card } from './card';
import { Icon, type IconName } from './icon';
import { IconTile } from './icon-tile';
import { Text } from './text';

type SettingRowProps = {
  label: string;
  /** The current setting, after the label; nothing when there is none. */
  value?: string | null;
  /** A state that reads as good, such as a connection, in its colour with a check. */
  valueIsGood?: boolean;
  /** A tile before the label, for a setting that stands for something else, as an app. */
  icon?: { name: IconName; color: keyof ColorTokens; background: keyof ColorTokens };
  /** What pressing the row does, for screen readers. */
  hint: string;
  onPress: () => void;
};

/** A setting in a row with its current value, which opens where it is changed. */
export function SettingRow({ label, value, valueIsGood, icon, hint, onPress }: SettingRowProps) {
  const { spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Card style={[styles.row, { gap: spacing.md }]}>
        {icon ? (
          <IconTile name={icon.name} size={40} color={icon.color} background={icon.background} />
        ) : null}
        <Text variant="label" style={styles.label}>
          {label}
        </Text>
        {value ? (
          <View style={[styles.row, styles.value, { gap: spacing.xs }]}>
            {valueIsGood ? <Icon name="check" size={16} color="success" /> : null}
            <Text
              variant="bodyStrong"
              color={valueIsGood ? 'success' : 'textMuted'}
              numberOfLines={1}
              style={styles.value}
            >
              {value}
            </Text>
          </View>
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
