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
import { MacroTargets } from '@/nutrition/macro-targets';
import { useNutritionTargets } from '@/nutrition/targets';
import { usePlan } from '@/plan/use-plan';
import { useTheme } from '@/theme';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { WeekStrip } from './week-strip';
import { WeightCard } from './weight-card';
import { WorkoutCard } from './workout-card';

/** The home tab: the week, today's workout, the daily targets and the weight. */
export function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const formatDate = useDateFormat('full');
  const plan = usePlan();
  const targets = useNutritionTargets();
  const latestWeight = useLatestWeight();
  const weightUnit = useWeightUnit();
  const queries = [plan, targets, latestWeight, weightUnit];
  const today = new Date();

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
        <WeekStrip
          today={today}
          trainingDays={plan.data?.sessions.map((session) => session.weekday) ?? []}
        />
        {plan.data ? <WorkoutCard plan={plan.data} today={today} /> : null}
        {targets.data ? (
          <Card entering={FadeInDown.delay(200).duration(400)}>
            <Text variant="headline">{t('today.targets')}</Text>
            <MacroTargets targets={targets.data} />
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
        <View>
          <Text variant="caption" color="textMuted">
            {formatDate(today)}
          </Text>
          <Text variant="title">{t('today.title')}</Text>
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
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  devLink: {
    alignSelf: 'center',
  },
});
