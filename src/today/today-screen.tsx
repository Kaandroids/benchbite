import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Text } from '@/components/ui/text';
import { useDateFormat } from '@/i18n/dates';
import { DailyProgress } from '@/nutrition/daily-progress';
import { useNutritionTargets, type NutritionTargets } from '@/nutrition/targets';
import { usePlan } from '@/plan/use-plan';
import { NO_STREAK } from '@/streak/streak';
import { StreakBadge } from '@/streak/streak-badge';
import { useTheme } from '@/theme';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { WeekStrip } from './week-strip';
import { WeightCard } from './weight-card';
import { WorkoutCard } from './workout-card';

/** Meals are logged in the nutrition milestone; until then nothing is eaten. */
const NOTHING_EATEN: NutritionTargets = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** The home tab: the week, today's workout, the daily targets and the weight. */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const formatDate = useDateFormat('long');
  const plan = usePlan();
  const targets = useNutritionTargets();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const queries = [plan, targets, latestWeight, weightUnit];
  const today = new Date();
  const streak = NO_STREAK;

  const refetchFailed = () =>
    Promise.all(queries.filter((query) => query.isError).map((query) => query.refetch()));
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all(queries.map((query) => query.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  let content;
  if (queries.some((query) => query.isError)) {
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
        <WeekStrip today={today} days={streak.days} />
        {plan.data ? <WorkoutCard plan={plan.data} today={today} /> : null}
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
        <View style={styles.header}>
          <View style={styles.side} />
          <Text variant="bodyStrong" accessibilityRole="header">
            {formatDate(today)}
          </Text>
          <View style={[styles.side, styles.end]}>
            <StreakBadge streak={streak} />
          </View>
        </View>
        {content}
        {__DEV__ ? (
          <Link href="/dev/components" style={styles.devLink}>
            <Text variant="bodyStrong" color="primaryText">
              Open the component gallery
            </Text>
          </Link>
        ) : null}
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
  },
  side: {
    flex: 1,
  },
  end: {
    alignItems: 'flex-end',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  devLink: {
    alignSelf: 'center',
  },
});
