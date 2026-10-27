import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { BackBar } from '@/components/ui/back-bar';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Note } from '@/components/ui/note';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AmountForm } from './amount-form';
import { setRemovedEntry, useRemoveEntry, useUpdateEntry } from './entries';
import { useFood } from './foods';
import { totalOf, useDayEntries, type LoggedEntry } from './meals';
import { useNutritionTargets } from './targets';

type EntryScreenProps = {
  id: number;
  /** The entry's day, YYYY-MM-DD. */
  day: string;
};

/** Changes how much of a food an entry holds, or removes it. It stays in its meal. */
export function EntryScreen({ id, day }: EntryScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const entries = useDayEntries(day);
  const targets = useNutritionTargets();
  const removeEntry = useRemoveEntry();
  const entry = entries.data?.find((item) => item.id === id);

  const remove = (removing: LoggedEntry) => {
    removeEntry
      .mutateAsync(removing)
      .then(() => {
        // The meal screen offers to undo it.
        setRemovedEntry(removing);
        router.back();
      })
      .catch(() => {});
  };

  let content;
  if (!allLoaded([entries, targets])) {
    content = (
      <View style={[styles.flex, { padding: spacing.xl }]}>
        <LoadState queries={[entries, targets]} />
      </View>
    );
  } else if (!entry) {
    content = (
      <MessageView
        icon="meal"
        title={t('nutrition.entry.notFound.title')}
        message={t('nutrition.entry.notFound.message')}
      />
    );
  } else {
    content = (
      <EntryForm
        entry={entry}
        eatenCalories={totalOf(entries.data ?? []).calories - entry.calories}
        targetCalories={targets.data?.calories ?? null}
        removeError={removeEntry.isError}
      />
    );
  }

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <BackBar
        action={
          entry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('nutrition.entry.remove')}
              accessibilityState={{ disabled: removeEntry.isPending }}
              disabled={removeEntry.isPending}
              onPress={() => remove(entry)}
              style={styles.remove}
            >
              <Icon name="trash" color="danger" />
            </Pressable>
          ) : null
        }
      />
      {content}
    </SafeAreaView>
  );
}

type EntryFormProps = {
  entry: LoggedEntry;
  /** What the day has without this entry. */
  eatenCalories: number;
  targetCalories: number | null;
  removeError: boolean;
};

function EntryForm({ entry, eatenCalories, targetCalories, removeError }: EntryFormProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  // The food's portions; a food taken out of the library leaves grams only.
  const food = useFood(entry.foodId);
  const updateEntry = useUpdateEntry();

  if (!allLoaded([food])) {
    return <LoadState queries={[food]} />;
  }

  return (
    <AmountForm
      title={entry.name}
      subtitle={`${t(`nutrition.entry.inMeal.${entry.meal}`)} · ${t('nutrition.amount.per100g', {
        calories: format(entry.per100g.calories),
      })}`}
      // The values it was logged with, as the database counts the entry by them (ADR 0034).
      per100g={entry.per100g}
      portions={food.data?.portions ?? []}
      initial={entry}
      eatenCalories={eatenCalories}
      targetCalories={targetCalories}
      note={t('nutrition.entry.was', { calories: format(Math.round(entry.calories)) })}
      submitLabel={t('nutrition.entry.save')}
      submitting={updateEntry.isPending}
      error={
        updateEntry.isError ? (
          <Note tone="danger">{t('nutrition.entry.saveError')}</Note>
        ) : removeError ? (
          <Note tone="danger">{t('nutrition.meal.removeError')}</Note>
        ) : undefined
      }
      onSubmit={(amount) =>
        updateEntry
          .mutateAsync({ id: entry.id, day: entry.day, amount })
          .then(() => router.back())
          .catch(() => {})
      }
    />
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  remove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
