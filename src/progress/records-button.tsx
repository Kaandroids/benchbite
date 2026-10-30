import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { recordsThisMonth, useRecordHistory } from '@/history/record-history';
import { useRecordFormat } from '@/sets/records';
import { useTheme } from '@/theme';

import { useExerciseName } from './record-row';

type RecordsButtonProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/**
 * Opens the records (ADR 0047), with how many were beaten this month and the latest of them.
 */
export function RecordsButton({ entering, today }: RecordsButtonProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const records = useRecordHistory();
  const library = useExerciseLibrary();
  const formatRecord = useRecordFormat();
  const exerciseName = useExerciseName();

  const latest = records.data?.[0];
  const recent = records.data ? recordsThisMonth(records.data, today).length : 0;
  let summary: string | null = null;
  if (records.data && library.data) {
    summary = latest
      ? [
          ...(recent > 0 ? [t('progress.records.newThisMonth', { count: recent })] : []),
          `${exerciseName(findExercise(library.data, latest.exerciseId))} ${formatRecord(latest)}`,
        ].join(' · ')
      : t('progress.records.none');
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/progress/records')}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card entering={entering}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name="trophy" color="breakfast" background="breakfastBackground" />
          <View style={styles.text}>
            <Text variant="label">{t('progress.records.title')}</Text>
            {summary ? (
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {summary}
              </Text>
            ) : null}
          </View>
          <Icon name="forward" color="textMuted" />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
});
