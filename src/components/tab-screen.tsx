import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing as spacingTokens, useTheme } from '@/theme';

type TabScreenProps = {
  /** What pulling down loads again. */
  queries: { refetch: () => Promise<unknown> }[];
  children: ReactNode;
  /** The space between the screen's parts. */
  gap?: keyof typeof spacingTokens;
  /** Shown over the screen rather than scrolled with it, such as a sheet. */
  overlay?: ReactNode;
};

/** A tab's own screen: its content scrolls, and pulling it down loads the queries again. */
export function TabScreen({ queries, children, gap = 'lg', overlay }: TabScreenProps) {
  const { colors, spacing } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.xl, gap: spacing[gap] }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {children}
      </ScrollView>
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});
