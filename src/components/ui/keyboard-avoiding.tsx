import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, type ViewStyle } from 'react-native';

type KeyboardAvoidingProps = {
  children: ReactNode;
  /** Defaults to filling the space it is given. */
  style?: ViewStyle;
};

/**
 * Keeps fields and the buttons below them above the keyboard. iOS needs the room made by
 * padding; Android resizes the window for the keyboard itself.
 */
export function KeyboardAvoiding({ children, style = styles.flex }: KeyboardAvoidingProps) {
  return (
    <KeyboardAvoidingView style={style} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
