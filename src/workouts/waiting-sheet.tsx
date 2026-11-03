import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BiteAvatar } from '@/coach/bite-avatar';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const BITE_SIZE = 64;
/** How far Bite stands above the sheet's top edge, the rest of it over the sheet's corner. */
const BITE_PEEK = 44;

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
  const { colors, spacing } = useTheme();
  return (
    <Sheet onClose={onClose}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.bite,
          {
            top: -BITE_PEEK,
            right: spacing.xl,
            borderRadius: BITE_SIZE,
            borderColor: colors.background,
          },
        ]}
      >
        <BiteAvatar size={BITE_SIZE} looksAbout />
      </View>
      <View
        style={{ gap: spacing.xs, paddingRight: BITE_SIZE + spacing.md, marginBottom: spacing.sm }}
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

const styles = StyleSheet.create({
  bite: {
    position: 'absolute',
    borderWidth: 4,
  },
});
