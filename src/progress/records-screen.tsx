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
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { latestByExercise, useRecordHistory, type BeatenRecord } from '@/history/record-history';
import { fromIsoDate } from '@/i18n/dates';

import { RecordRow } from './record-row';

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
  const today = new Date();
  const thisMonth = toMonth(today);
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

  const nameOf = (record: BeatenRecord) =>
    findExercise(library.data, record.exerciseId)?.name ?? '';
  const monthName = (month: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: 'long',
      ...(month.startsWith(String(today.getFullYear())) ? {} : { year: 'numeric' }),
    }).format(fromIsoDate(`${month}-01`));
  let groups: { title: string; records: BeatenRecord[] }[];
  if (order === 'latest') {
    const byMonth = new Map<string, BeatenRecord[]>();
    for (const record of all) {
      const month = record.day.slice(0, 7);
      byMonth.set(month, [...(byMonth.get(month) ?? []), record]);
    }
    groups = [...byMonth].map(([month, inMonth]) => ({
      title: month === thisMonth ? t('progress.records.thisMonth') : monthName(month),
      records: inMonth,
    }));
  } else {
    groups = [
      {
        title: '',
        records: latestByExercise(all).sort((a, b) =>
          nameOf(a).localeCompare(nameOf(b), i18n.language),
        ),
      },
    ];
  }

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
                exercise={findExercise(library.data, record.exerciseId)}
                today={today}
                recent={record.day.startsWith(thisMonth)}
                divider={index > 0}
              />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}

/** YYYY-MM of a date. */
function toMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  title: {
    paddingHorizontal: 4,
  },
});
