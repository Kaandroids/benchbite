import { StyleSheet, View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Card } from './card';
import { Switch } from './switch';
import { Text } from './text';

type SwitchCardProps = {
  label: string;
  /** What the switch does, or what went wrong, under the label. */
  note: string;
  noteColor?: keyof ColorTokens;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

/** A setting turned on and off in a card of its own: its label and note, then the switch. */
export function SwitchCard({
  label,
  note,
  noteColor = 'textMuted',
  value,
  onValueChange,
}: SwitchCardProps) {
  const { spacing } = useTheme();
  return (
    <Card style={[styles.row, { gap: spacing.md }]}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{label}</Text>
        <Text variant="caption" color={noteColor}>
          {note}
        </Text>
      </View>
      <Switch accessibilityLabel={label} value={value} onValueChange={onValueChange} />
    </Card>
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
});
