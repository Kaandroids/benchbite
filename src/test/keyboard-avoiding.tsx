// A stand-in for '@/components/ui/keyboard-avoiding' that marks what is kept above the keyboard,
// for tests to find: jest.mock('@/components/ui/keyboard-avoiding', () =>
// jest.requireActual('@/test/keyboard-avoiding')). The real component still does its work inside.
import type { ReactNode } from 'react';
import { View } from 'react-native';

const actual = jest.requireActual<typeof import('@/components/ui/keyboard-avoiding')>(
  '@/components/ui/keyboard-avoiding',
);

export const { keyboardOverlap, useShrinksForKeyboard } = actual;

export function KeyboardAvoiding({ children }: { children: ReactNode }) {
  return (
    <View testID="keyboard-avoiding">
      <actual.KeyboardAvoiding>{children}</actual.KeyboardAvoiding>
    </View>
  );
}
