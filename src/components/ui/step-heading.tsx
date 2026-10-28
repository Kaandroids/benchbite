import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './text';

/** A step's question, with a short line under it on why it is asked or what it sets. */
export function StepHeading({ title, intro }: { title: string; intro: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text color="textMuted">{intro}</Text>
    </View>
  );
}
