import { StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import type { BiteExpression } from '@/coach/bite-expressions';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type BiteMessageProps = {
  expression: BiteExpression;
  /** Bite's size: larger where the message stands for the whole app. */
  size?: number;
  title: string;
  message: string;
};

/**
 * Bite with a message, in the middle of a screen that stands in for a part of the app: what
 * happened as a heading, and what it means under it. The screen adds its own buttons. MessageView
 * is its counterpart with an icon in place of Bite.
 */
export function BiteMessage({ expression, size = 112, title, message }: BiteMessageProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.content, { gap: spacing.lg, padding: spacing.xl }]}>
      <BiteAvatar size={size} expression={expression} />
      <View style={{ gap: spacing.md }}>
        <Text variant="title" align="center" accessibilityRole="header">
          {title}
        </Text>
        <Text color="textMuted" align="center">
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
