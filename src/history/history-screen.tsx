import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { useDurationFormat, useWeekTitle } from './format';
import { byWeek, useLogSummaries } from './history';
import { LogRow } from './log-row';

/** Every finished workout, by week, latest first. */
export function HistoryScreen() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const logs = useLogSummaries();
  const weekTitle = useWeekTitle();
  const duration = useDurationFormat();

  return (
    <Screen onBack={() => router.back()}>
      <Text variant="title" accessibilityRole="header">
        {t('workout.history.title')}
      </Text>
      <LoadState queries={[logs]} />
      {allLoaded([logs]) && logs.data?.length === 0 ? (
        <Text color="textMuted">{t('workout.history.empty')}</Text>
      ) : null}
      {byWeek(logs.data ?? []).map((week) => (
        <View key={week.start.getTime()} style={{ gap: spacing.sm }}>
          <View style={styles.header}>
            <Text variant="caption" color="textMuted" style={[styles.bold, styles.flex]}>
              {weekTitle(week.start)}
            </Text>
            <View
              style={[styles.chip, { borderRadius: radii.full, backgroundColor: colors.selected }]}
            >
              <Text variant="caption" color="primaryText" style={styles.bold}>
                {t('history.weekTotal', { count: week.logs.length, time: duration(week.minutes) })}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.list,
              {
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                paddingHorizontal: spacing.lg,
              },
            ]}
          >
            {week.logs.map((log, index) => (
              <LogRow key={log.id} log={log} divider={index > 0} icons />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  list: {
    borderWidth: 1,
  },
});
