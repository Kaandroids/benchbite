import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { DaySummary } from './day-summary';
import { DaySwitcher } from './day-switcher';
import { MealList } from './meal-list';
import { mealsOf, suggestedCalories, totalOf, useDayEntries } from './meals';
import { useNutritionTargets } from './targets';

/** The nutrition tab: a day's calories and macros against the targets, and its meals. */
export function NutritionScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const today = new Date();
  // The distance from today rather than the date, so that today stays today after midnight.
  const [daysBack, setDaysBack] = useState(0);
  const day = addDays(today, -daysBack);
  const targets = useNutritionTargets();
  const entries = useDayEntries(toIsoDate(day));
  const queries = [targets, entries];

  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  let content = <LoadState queries={queries} />;
  if (allLoaded(queries)) {
    const meals = mealsOf(entries.data ?? []);
    content = (
      <>
        {targets.data ? (
          <DaySummary targets={targets.data} eaten={totalOf(entries.data ?? [])} />
        ) : null}
        <MealList
          meals={meals}
          suggested={targets.data ? suggestedCalories(targets.data.calories, meals) : new Map()}
        />
      </>
    );
  }

  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { padding: spacing.xl, gap: spacing.md }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={[styles.header, { gap: spacing.md, marginBottom: spacing.xs }]}>
          <Text variant="title" accessibilityRole="header" style={styles.title}>
            {t('tabs.nutrition')}
          </Text>
          <DaySwitcher today={today} daysBack={daysBack} onChange={setDaysBack} />
        </View>
        {content}
      </ScrollView>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
  },
});
