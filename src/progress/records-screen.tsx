import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { useExerciseLibrary } from '@/exercises/library';
import {
  byMonth,
  latestByExercise,
  monthOf,
  useRecordHistory,
  type BeatenRecord,
} from '@/history/record-history';
import { fromIsoDate, useMonthYearFormat, useShortDateFormat } from '@/i18n/dates';

import { RecordRow, useExerciseName } from './record-row';

type Order = 'latest' | 'exercise';

/**
 * The records beaten across every exercise (ADR 0047): the latest first, by month, or each
 * exercise's latest by its name. A record opens its exercise's history.
 */
export function RecordsScreen() {
  const { t, i18n } = useTranslation();
  const records = useRecordHistory();
  const library = useExerciseLibrary();
  const [order, setOrder] = useState<Order>('latest');
  const exerciseName = useExerciseName();
  const today = new Date();
  const thisMonth = monthOf(today);
  const shortDate = useShortDateFormat(today);
  const monthTitle = useMonthYearFormat(today);
  const title = t('progress.records.title');

  if (!allLoaded([records, library])) {
    return (
      <Screen onBack={() => router.back()} title={title}>
        <LoadState queries={[records, library]} />
      </Screen>
    );
  }
  const all = records.data ?? [];
  if (all.length === 0) {
    return (
      <Screen onBack={() => router.back()} title={title}>
        <MessageView
          icon="trophy"
          title={t('progress.records.empty.title')}
          message={t('progress.records.empty.message')}
        />
      </Screen>
    );
  }

  const exercises = new Map(library.data?.map((exercise) => [exercise.id, exercise]));
  const nameOf = (record: BeatenRecord) => exerciseName(exercises.get(record.exerciseId));
  const monthName = (month: string) => monthTitle(fromIsoDate(`${month}-01`));
  const groups: { title: string; records: BeatenRecord[] }[] =
    order === 'latest'
      ? byMonth(all).map(([month, inMonth]) => ({
          title: month === thisMonth ? t('progress.records.thisMonth') : monthName(month),
          records: inMonth,
        }))
      : [
          {
            title: '',
            records: latestByExercise(all).sort((a, b) =>
              nameOf(a).localeCompare(nameOf(b), i18n.language),
            ),
          },
        ];

  return (
    <Screen onBack={() => router.back()} title={title}>
      <SegmentedControl
        options={[
          { value: 'latest', label: t('progress.records.latest') },
          { value: 'exercise', label: t('progress.records.byExercise') },
        ]}
        value={order}
        onChange={setOrder}
        accessibilityLabel={t('progress.records.order')}
      />
      {groups.map((group) => (
        <View key={group.title} style={styles.group}>
          {group.title ? (
            <Text variant="label" color="textMuted" accessibilityRole="header" style={styles.title}>
              {group.title}
            </Text>
          ) : null}
          <Card list>
            {group.records.map((record, index) => (
              <RecordRow
                key={`${record.logId}-${record.exerciseId}`}
                record={record}
                exercise={exercises.get(record.exerciseId)}
                day={shortDate(fromIsoDate(record.day))}
                divider={index > 0}
              />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 4,
  },
});
