import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useFinishedThisWeek } from '@/history/history';
import { toIsoDate } from '@/i18n/dates';
import { DailyProgress } from '@/nutrition/daily-progress';
import { useNutritionTargets, type NutritionTargets } from '@/nutrition/targets';
import { useStreak } from '@/streak/use-streak';
import { useTheme } from '@/theme';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';
import { useWeekMoves } from '@/workouts/moves';
import {
  hasWorkouts,
  missedWorkouts,
  moveTargets,
  originOf,
  weekSchedule,
} from '@/workouts/week-schedule';
import { useWeek, type WeekSession } from '@/workouts/workouts';

import { DayMenu } from './day-menu';
import { MissedCard } from './missed-card';
import { PickDay } from './pick-day';
import { WeekCard } from './week-card';
import { WeightCard } from './weight-card';
import { WorkoutCard } from './workout-card';

/** Meals are logged in the nutrition milestone; until then nothing is eaten. */
const NOTHING_EATEN: NutritionTargets = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** What the sheet over the screen shows: a day of the week card, or the days to move a workout to. */
type SheetContent =
  { kind: 'day'; date: string } | { kind: 'pick'; session: WeekSession; fromOn: string };

/** A greeting for the time of day. */
export function greetingOf(date: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = date.getHours();
  return hour >= 5 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'evening';
}

/** The home tab: a greeting, the week, today's workout, the daily targets and the weight. */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const plan = useWeek();
  const targets = useNutritionTargets();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const streak = useStreak();
  const today = new Date();
  const finished = useFinishedThisWeek(today);
  const moves = useWeekMoves(today);
  const queries = [plan, targets, latestWeight, weightUnit, finished, moves];

  const refetchFailed = () =>
    Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch()));
  const [refreshing, setRefreshing] = useState(false);
  const [sheet, setSheet] = useState<SheetContent | null>(null);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  const schedule = weekSchedule(
    plan.data?.sessions ?? [],
    moves.data ?? [],
    finished.data ?? [],
    today,
  );
  const todayOn = toIsoDate(today);
  const sheetDay =
    sheet?.kind === 'day'
      ? schedule.days.find((day) => day.date === sheet.date && hasWorkouts(day))
      : undefined;
  // A day left with nothing to show, for example after undoing the only move to it, closes.
  if (sheet?.kind === 'day' && !sheetDay) {
    setSheet(null);
  }

  let content;
  // A query that loaded and then failed to refresh keeps showing what it has.
  if (queries.some((query) => query.isError && query.data === undefined)) {
    content = (
      <View style={[styles.center, { gap: spacing.xl }]}>
        <MessageView
          icon="offline"
          title={t('today.error.title')}
          message={t('today.error.message')}
        />
        <Button
          label={t('common.tryAgain')}
          loading={queries.some((query) => query.isFetching)}
          onPress={() => void refetchFailed()}
        />
      </View>
    );
  } else if (queries.some((query) => query.isPending)) {
    content = (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('today.loading')} />
      </View>
    );
  } else {
    content = (
      <>
        <WeekCard
          today={today}
          streak={streak}
          schedule={schedule}
          onDayPress={(day) => setSheet({ kind: 'day', date: day.date })}
        />
        {missedWorkouts(schedule).map(({ workout, day }) => {
          const fromOn = originOf(workout, day);
          return (
            <MissedCard
              key={`${workout.session.workoutId}-${fromOn}`}
              workout={workout}
              day={day}
              canMove={moveTargets(schedule, workout.session.workoutId, fromOn, todayOn).length > 0}
              onPickDay={() => setSheet({ kind: 'pick', session: workout.session, fromOn })}
            />
          );
        })}
        {plan.data ? (
          <WorkoutCard schedule={schedule} sessions={plan.data.sessions} today={today} />
        ) : null}
        {targets.data ? (
          <Card entering={FadeInDown.delay(200).duration(400)}>
            <Text variant="headline">{t('today.targets')}</Text>
            <DailyProgress targets={targets.data} eaten={NOTHING_EATEN} />
          </Card>
        ) : null}
        <WeightCard
          latest={latestWeight.data ?? null}
          unit={weightUnit.data ?? 'kg'}
          today={today}
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
        contentContainerStyle={[styles.content, { padding: spacing.xl, gap: spacing.lg }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <Text variant="title" accessibilityRole="header">
          {t(`today.greeting.${greetingOf(today)}`)}
        </Text>
        {content}
      </ScrollView>
      {/* One sheet whose content changes, as a modal cannot open while another one closes. */}
      {sheet ? (
        <Sheet onClose={() => setSheet(null)}>
          {sheet.kind === 'pick' ? (
            <PickDay
              schedule={schedule}
              session={sheet.session}
              fromOn={sheet.fromOn}
              today={today}
              onDone={() => setSheet(null)}
            />
          ) : sheetDay ? (
            <DayMenu
              schedule={schedule}
              day={sheetDay}
              today={today}
              onMove={(session, fromOn) => setSheet({ kind: 'pick', session, fromOn })}
            />
          ) : null}
        </Sheet>
      ) : null}
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
  center: {
    flex: 1,
    justifyContent: 'center',
  },
});
