import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

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
