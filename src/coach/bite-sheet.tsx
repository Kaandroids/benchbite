import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';

const BITE_SIZE = 64;
/** How far Bite stands above the sheet's top edge, the rest of it over the sheet's corner. */
const BITE_PEEK = 44;

type BiteSheetProps = {
  title: string;
  body: string;
  /** The sheet's buttons and anything else under the text, spaced as in any sheet. */
  children: ReactNode;
  onClose: () => void;
};

/**
 * A sheet that Bite looks over (#416): its title and text beside Bite, who stands over the top
 * right corner ringed in the sheet's colour, then what the sheet offers. Such as what waits for
 * premium, or the plans to choose from.
 */
export function BiteSheet({ title, body, children, onClose }: BiteSheetProps) {
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
      {/* Clear of Bite, so that the title never runs under it. */}
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
