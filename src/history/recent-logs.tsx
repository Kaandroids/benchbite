import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { useLogSummaries, weekStart } from './history';
import { LogRow } from './log-row';

const SHOWN = 3;

/** The latest finished workouts on the Workout tab, with a way to all of them. */
export function RecentLogs() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const logs = useLogSummaries();
  const thisWeek = weekStart(new Date()).getTime();
  const all = logs.data ?? [];
  const inWeek = all.filter((log) => log.startedAt.getTime() >= thisWeek).length;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text variant="caption" color="textMuted" style={styles.bold}>
          {t('workout.history.title')}
        </Text>
        {inWeek > 0 ? (
          <View
            style={[styles.chip, { borderRadius: radii.full, backgroundColor: colors.selected }]}
          >
            <Text variant="caption" color="primaryText" style={styles.bold}>
              {t('history.thisWeek', { count: inWeek })}
            </Text>
          </View>
        ) : null}
        <View style={styles.flex} />
        {all.length > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/workout/history')}
            style={styles.seeAll}
          >
            <Text variant="caption" color="primaryText" style={styles.bold}>
              {t('history.seeAll')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {all.length > 0 ? (
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
          {all.slice(0, SHOWN).map((log, index) => (
            <LogRow key={log.id} log={log} divider={index > 0} />
          ))}
        </View>
      ) : (
        <Card>
          <Text color="textMuted">{t('workout.history.empty')}</Text>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  seeAll: {
    minHeight: 32,
    justifyContent: 'center',
  },
  list: {
    borderWidth: 1,
  },
});
