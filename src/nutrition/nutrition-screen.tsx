import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabScreen } from '@/components/tab-screen';
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
  const { spacing } = useTheme();
  const today = new Date();
  // The distance from today rather than the date, so that today stays today after midnight.
  const [daysBack, setDaysBack] = useState(0);
  const day = addDays(today, -daysBack);
  const targets = useNutritionTargets();
  const entries = useDayEntries(toIsoDate(day));
  const queries = [targets, entries];

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
    <TabScreen queries={queries} gap="md">
      <View style={[styles.header, { gap: spacing.md, marginBottom: spacing.xs }]}>
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {t('tabs.nutrition')}
        </Text>
        <DaySwitcher today={today} daysBack={daysBack} onChange={setDaysBack} />
      </View>
      {content}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    flexShrink: 1,
  },
});
