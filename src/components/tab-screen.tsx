import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { spacing as spacingTokens, useTheme } from '@/theme';

import { useTabScroll } from './tab-space';

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
  const { ref, barSpace } = useTabScroll();
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    // The tab bar floats over the bottom, so the content scrolls past it.
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        ref={ref}
        contentContainerStyle={[
          styles.content,
          { padding: spacing.xl, paddingBottom: barSpace + spacing.xl, gap: spacing[gap] },
        ]}
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
