import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabScreen } from '@/components/tab-screen';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate } from '@/i18n/dates';
import { useWaterGoal } from '@/profile/water-goal';
import { useTheme } from '@/theme';

import { DaySummary } from './day-summary';
import { DaySwitcher } from './day-switcher';
import { MealList } from './meal-list';
import { mealsOf, suggestedCalories, totalOf, useDayEntries, useDueMeal } from './meals';
import { useDayTargets } from './targets';
import { useWater } from './water';
import { WaterCard } from './water-card';

/** The nutrition tab: a day's calories and macros against the targets, its meals and water. */
export function NutritionScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const today = new Date();
  // The distance from today rather than the date, so that today stays today after midnight.
  const [daysBack, setDaysBack] = useState(0);
  const day = addDays(today, -daysBack);
  const targets = useDayTargets(toIsoDate(day));
  const entries = useDayEntries(toIsoDate(day));
  const water = useWater(toIsoDate(day));
  const waterGoal = useWaterGoal();
  const due = useDueMeal();
  const queries = [targets, entries, water, waterGoal];

  const loaded = allLoaded(queries);
  let content = <LoadState queries={queries} />;
  if (loaded) {
    const meals = mealsOf(entries.data ?? []);
    content = (
      <>
        <MealList
          meals={meals}
          due={daysBack === 0 ? due : undefined}
          suggested={targets.data ? suggestedCalories(targets.data.calories, meals) : new Map()}
          onOpen={(meal) =>
            router.push({ pathname: '/nutrition/meal', params: { meal, day: toIsoDate(day) } })
          }
          onAdd={(meal) =>
            router.push({ pathname: '/nutrition/add', params: { meal, day: toIsoDate(day) } })
          }
        />
        <WaterCard day={toIsoDate(day)} drunk={water.data ?? 0} goal={waterGoal.data ?? 0} />
      </>
    );
  }

  return (
    <TabScreen queries={queries} gap="md">
      <View style={[styles.header, { gap: spacing.md, marginBottom: spacing.xs }]}>
        <Text variant="title" accessibilityRole="header" style={styles.title}>
          {t('tabs.nutrition')}
        </Text>
        {/* The goals the day is measured against, to see or change (ADR 0039). */}
        <PillButton
          icon="target"
          label={t('nutrition.goals.button')}
          onPress={() => router.push('/nutrition/goals')}
        />
      </View>
      {/* Shown while another day loads, so that the day can be changed again at once. */}
      <DaySummary
        header={<DaySwitcher today={today} daysBack={daysBack} onChange={setDaysBack} />}
        // Once the two it sums are in, whatever else is still loading.
        totals={
          targets.data && entries.data
            ? { targets: targets.data, eaten: totalOf(entries.data) }
            : null
        }
      />
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
