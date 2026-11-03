import type { ReactNode } from 'react';
import { View } from 'react-native';

import { BITE_PEEK_ROOM, BitePeek } from '@/coach/bite-peek';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type WaitingSheetProps = {
  title: string;
  body: string;
  /** The sheet's buttons, under the text, spaced as in any sheet. */
  children: ReactNode;
  onClose: () => void;
};

/**
 * A sheet for something that waits for premium (ADR 0079), such as a workout or an alternative:
 * what waits and that it is kept, with Bite looking over the sheet's corner.
 */
export function WaitingSheet({ title, body, children, onClose }: WaitingSheetProps) {
  const { spacing } = useTheme();
  return (
    <Sheet onClose={onClose}>
      <BitePeek />
      <View
        style={{
          gap: spacing.xs,
          paddingRight: BITE_PEEK_ROOM + spacing.md,
          marginBottom: spacing.sm,
        }}
      >
        <Text variant="headline" accessibilityRole="header">
          {title}
        </Text>
        <Text color="textMuted">{body}</Text>
      </View>
      {children}
    </Sheet>
  );
}
