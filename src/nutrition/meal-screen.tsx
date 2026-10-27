import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { BackBar } from '@/components/ui/back-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Note } from '@/components/ui/note';
import { Text } from '@/components/ui/text';
import { Toast } from '@/components/ui/toast';
import { daysBetween, fromIsoDate, useWeekdayDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { useDayName } from './day-name';
import { useRemoveEntry, useRestoreEntry } from './entries';
import { EntryRow } from './entry-row';
import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import { totalOf, useDayEntries, type LoggedEntry, type Meal } from './meals';
import { takeRemovedEntry } from './removed-entry';

type MealScreenProps = {
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
};

/** A meal's entries on a day, with their totals; each opens to change, or swipes away. */
export function MealScreen({ meal, day }: MealScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const dayName = useDayName();
  const weekdayDate = useWeekdayDateFormat();
  const entries = useDayEntries(day);
  const removeEntry = useRemoveEntry();
  const restoreEntry = useRestoreEntry();
  // The entry removed last, which the toast offers to put back.
  const [removed, setRemoved] = useState<LoggedEntry | null>(null);

  // An entry removed on its own screen comes back here to be offered for undo.
  useFocusEffect(
    useCallback(() => {
      const entry = takeRemovedEntry(meal, day);
      if (entry) {
        setRemoved(entry);
      }
    }, [meal, day]),
  );
  const hideToast = useCallback(() => setRemoved(null), []);

  const date = fromIsoDate(day);
  const items = entries.data?.filter((entry) => entry.meal === meal) ?? [];
  const totals = totalOf(items);

  // Handled per call: callbacks passed to mutate() run only for the latest one.
  const remove = (entry: LoggedEntry) => {
    removeEntry
      .mutateAsync(entry)
      .then(() => setRemoved(entry))
      .catch(() => {});
  };
  const undo = (entry: LoggedEntry) => restoreEntry.mutate(entry);

  let content;
  if (!allLoaded([entries])) {
    content = (
      <View style={[styles.flex, { padding: spacing.xl }]}>
        <LoadState queries={[entries]} />
      </View>
    );
  } else {
    content = (
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: 0, gap: spacing.md }}>
        <View>
          <Text variant="title" accessibilityRole="header">
            {t(`nutrition.meals.${meal}`)}
          </Text>
          <Text variant="bodyStrong" color="textMuted">
            {t('nutrition.meal.dayLine', {
              name: dayName(date, daysBetween(date, new Date())),
              date: weekdayDate(date),
            })}
          </Text>
        </View>

        <Card style={[styles.totals, { gap: spacing.md }]}>
          <Text variant="headline" color="primaryText">
            {format(Math.round(totals.calories))}{' '}
            <Text variant="bodyStrong" color="textMuted">
              kcal
            </Text>
          </Text>
          <View style={[styles.macros, { gap: spacing.md }]}>
            {MACROS.map(({ key, grams, color }) => (
              <View
                key={key}
                accessible
                accessibilityLabel={`${t(`nutrition.macros.${key}`)} ${t('nutrition.grams', { count: Math.round(totals[grams]) })}`}
                style={[styles.macro, { gap: spacing.xs }]}
              >
                <MacroDot color={color} />
                <Text variant="captionStrong">
                  {t('nutrition.grams', { count: Math.round(totals[grams]) })}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {items.length > 0 ? (
          <>
            <Card list style={styles.list}>
              {items.map((entry, index) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  first={index === 0}
                  onOpen={() =>
                    router.push({
                      pathname: '/nutrition/entry/[id]',
                      params: { id: String(entry.id), day },
                    })
                  }
                  onRemove={() => remove(entry)}
                />
              ))}
            </Card>
            <Text variant="caption" color="textMuted" align="center">
              {t('nutrition.meal.swipeHint')}
            </Text>
          </>
        ) : (
          <Text variant="body" color="textMuted" align="center" style={{ padding: spacing.xl }}>
            {t('nutrition.meal.empty')}
          </Text>
        )}

        {removeEntry.isError ? <Note tone="danger">{t('nutrition.meal.removeError')}</Note> : null}
        {restoreEntry.isError ? <Note tone="danger">{t('nutrition.meal.undoError')}</Note> : null}
      </ScrollView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <BackBar />
      {content}
      <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.md }}>
        {removed ? (
          <Toast
            // A new toast for each removal, so that its time and announcement start again.
            key={removed.id}
            message={t('nutrition.meal.removed', { name: removed.name })}
            action={{ label: t('nutrition.meal.undo'), onPress: () => undo(removed) }}
            onHide={hideToast}
          />
        ) : null}
        <Button
          label={t(`nutrition.addTo.${meal}`)}
          onPress={() => router.push({ pathname: '/nutrition/add', params: { meal, day } })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  totals: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  macros: {
    flexDirection: 'row',
  },
  macro: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The rows pad themselves, so that a swiped row reaches the card's edges.
  list: {
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
});
