import { useRef } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputInstance } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

type CodeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  length: number;
  /** What the field is for, read by screen readers. */
  label: string;
  /** Turns the boxes red, as for a wrong code. */
  invalid?: boolean;
};

/**
 * A code from an email, a box for each digit. One input lies over the boxes, unseen, so typing,
 * pasting and the keyboard's suggestion of the code all work as in any field. iOS does not pass
 * touches to so faint a view, so a press on the boxes focuses the input, which brings back a
 * keyboard that was closed.
 */
export function CodeField({ value, onChange, length, label, invalid = false }: CodeFieldProps) {
  const { colors, radii } = useTheme();
  const input = useRef<TextInputInstance>(null);
  const active = (index: number) =>
    index < value.length || (index === value.length && index < length);

  return (
    // Not a target of its own for screen readers, which reach the input.
    <Pressable accessible={false} onPress={() => input.current?.focus()} style={styles.row}>
      {Array.from({ length }, (_, index) => (
        <View
          key={index}
          style={[
            styles.box,
            {
              borderRadius: radii.md,
              backgroundColor: colors.surface,
              borderColor: invalid ? colors.danger : active(index) ? colors.primary : colors.border,
            },
          ]}
        >
          <Text variant="title">{value[index] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        autoFocus
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        caretHidden
        style={styles.input}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  box: {
    flex: 1,
    maxWidth: 52,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  input: {
    ...StyleSheet.absoluteFill,
    // Not 0, which would hide the field from screen readers on iOS.
    opacity: 0.01,
  },
});
