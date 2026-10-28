import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabScreen } from '@/components/tab-screen';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate } from '@/i18n/dates';
import { useWaterGoal } from '@/profile/water-goal';
import { useTheme } from '@/theme';

import { DaySummary } from './day-summary';
import { DaySwitcher } from './day-switcher';
import { MealList } from './meal-list';
import { mealsOf, suggestedCalories, totalOf, useDayEntries } from './meals';
import { useNutritionTargets } from './targets';
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
  const targets = useNutritionTargets();
  const entries = useDayEntries(toIsoDate(day));
  const water = useWater(toIsoDate(day));
  const waterGoal = useWaterGoal();
  const queries = [targets, entries, water, waterGoal];

  const loaded = allLoaded(queries);
  let content = <LoadState queries={queries} />;
  if (loaded) {
    const meals = mealsOf(entries.data ?? []);
    content = (
      <>
        <MealList
          meals={meals}
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
      <Text variant="title" accessibilityRole="header" style={{ marginBottom: spacing.xs }}>
        {t('tabs.nutrition')}
      </Text>
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
