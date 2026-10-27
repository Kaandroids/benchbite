import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { useRecentLogs } from './history';
import { LogRow } from './log-row';

const SHOWN = 3;

/** The latest finished workouts on the Workout tab, with a way to all of them. */
export function RecentLogs() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const recent = useRecentLogs(SHOWN);
  const all = recent.data?.latest ?? [];
  const inWeek = recent.data?.thisWeek ?? 0;

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.header}>
        <Text variant="captionStrong" color="textMuted">
          {[
            t('workout.history.title'),
            inWeek > 0 ? t('history.thisWeek', { count: inWeek }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={styles.flex} />
        {all.length > 0 ? (
          <TextLink label={t('history.seeAll')} onPress={() => router.push('/workout/history')} />
        ) : null}
      </View>
      {/* While loading or after an error, never the empty card: the history is not gone. */}
      {!allLoaded([recent]) ? (
        <LoadState queries={[recent]} />
      ) : all.length > 0 ? (
        <Card list>
          {all.map((log, index) => (
            <LogRow key={log.id} log={log} divider={index > 0} />
          ))}
        </Card>
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
});
