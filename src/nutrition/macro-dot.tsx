import { View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

/** The coloured dot that marks a macro, such as teal for protein. */
export function MacroDot({ color, size = 8 }: { color: keyof ColorTokens; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors[color] }}
    />
  );
}
