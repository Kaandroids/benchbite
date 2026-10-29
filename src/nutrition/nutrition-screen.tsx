import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { TabHeader } from '@/components/tab-header';
import { TabScreen } from '@/components/tab-screen';
import { addDays, daysBetween, fromIsoDate, toIsoDate } from '@/i18n/dates';
import { clamp } from '@/lib/math';
import { useWaterGoal } from '@/profile/water-goal';

import { DaySummary } from './day-summary';
import { DaySwitcher } from './day-switcher';
import { MealList } from './meal-list';
import { GoalsButton } from './goals-button';
import { LOGGABLE_DAYS, mealsOf, suggestedCalories, totalOf, useDayEntries } from './meals';
import { useDayTargets } from './targets';
import { useWater } from './water';
import { WaterCard } from './water-card';

/** The nutrition tab: a day's calories and macros against the targets, its meals and water. */
export function NutritionScreen() {
  const { t } = useTranslation();
  const today = new Date();
  // The distance from today rather than the date, so that today stays today after midnight.
  const [daysBack, setDaysBack] = useState(0);
  // A day to open, as from the streak's break; each one is opened once.
  const { day: dayParam } = useLocalSearchParams<{ day?: string }>();
  const [opened, setOpened] = useState<string | undefined>(undefined);
  if (dayParam !== opened) {
    setOpened(dayParam);
    if (dayParam) {
      setDaysBack(clamp(daysBetween(fromIsoDate(dayParam), today), 0, LOGGABLE_DAYS));
    }
  }
  const day = addDays(today, -daysBack);
  const targets = useDayTargets(toIsoDate(day));
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
      <TabHeader title={t('tabs.nutrition')}>
        {/* The goals the day is measured against, to see or change (ADR 0039). */}
        <GoalsButton
          calories={
            targets.data && entries.data
              ? { eaten: totalOf(entries.data).calories, goal: targets.data.calories }
              : null
          }
          onPress={() => router.push('/nutrition/goals')}
        />
      </TabHeader>
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
