import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type TabHeaderProps = {
  title: string;
  /** Buttons at the end of the row, such as the settings. */
  children?: ReactNode;
};

/** The top of a tab: its name, with its buttons at the end of the row. */
export function TabHeader({ title, children }: TabHeaderProps) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.header, { gap: spacing.sm }]}>
      <Text variant="title" accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
});
