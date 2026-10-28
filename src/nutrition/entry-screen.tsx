import { router, useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Note } from '@/components/ui/note';
import { Screen } from '@/components/ui/screen';
import { useNumberFormat } from '@/i18n/units';

import { AmountForm } from './amount-form';
import { useRemoveEntry, useUpdateEntry } from './entries';
import { useFood, type Portion } from './foods';
import { totalOf, useDayEntries, type LoggedEntry } from './meals';
import { handOverRemovedEntry } from './removed-entry';
import { useDayTargets } from './targets';

type EntryScreenProps = {
  id: number;
  /** The entry's day, YYYY-MM-DD. */
  day: string;
};

/** Changes how much of a food an entry holds, or removes it. It stays in its meal. */
export function EntryScreen({ id, day }: EntryScreenProps) {
  const { t } = useTranslation();
  const entries = useDayEntries(day);
  const targets = useDayTargets(day);
  const removeEntry = useRemoveEntry();
  const navigation = useNavigation();
  const entry = entries.data?.find((item) => item.id === id);

  // Once the request is done, and only if the screen is still showing: going back by hand while
  // it ran must not take the user a screen further.
  const remove = (removing: LoggedEntry) => {
    removeEntry
      .mutateAsync(removing)
      .then(() => {
        if (navigation.isFocused()) {
          // The meal screen offers to undo it.
          handOverRemovedEntry(removing);
          router.back();
        }
      })
      .catch(() => {});
  };

  if (allLoaded([entries, targets]) && entry) {
    return (
      <EntryForm
        entry={entry}
        eatenCalories={totalOf(entries.data ?? []).calories - entry.calories}
        targetCalories={targets.data?.calories ?? null}
        removing={removeEntry.isPending}
        removeError={removeEntry.isError}
        onRemove={() => remove(entry)}
        onSaved={() => {
          if (navigation.isFocused()) {
            router.back();
          }
        }}
      />
    );
  }
  return (
    <Screen onBack={() => router.back()}>
      {allLoaded([entries, targets]) ? (
        <MessageView
          icon="meal"
          title={t('nutrition.entry.notFound.title')}
          message={t('nutrition.entry.notFound.message')}
        />
      ) : (
        <LoadState queries={[entries, targets]} />
      )}
    </Screen>
  );
}

/**
 * The food's portions, with the entry's own at the size it was logged in, so that an unchanged
 * entry keeps its grams after the library changes a portion, or drops it.
 */
function portionsOf(entry: LoggedEntry, portions: Portion[]): Portion[] {
  if (!entry.portion) {
    return portions;
  }
  const logged = { unit: entry.portion.unit, grams: entry.grams / entry.portion.count };
  return [logged, ...portions.filter((portion) => portion.unit !== logged.unit)];
}

type EntryFormProps = {
  entry: LoggedEntry;
  /** What the day has without this entry. */
  eatenCalories: number;
  targetCalories: number | null;
  removing: boolean;
  removeError: boolean;
  onRemove: () => void;
  onSaved: () => void;
};

function EntryForm({
  entry,
  eatenCalories,
  targetCalories,
  removing,
  removeError,
  onRemove,
  onSaved,
}: EntryFormProps) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  // The food's other portions; a food taken out of the library has none.
  const food = useFood(entry.food);
  const updateEntry = useUpdateEntry();

  if (!allLoaded([food])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[food]} />
      </Screen>
    );
  }

  return (
    <AmountForm
      title={entry.name}
      subtitle={`${t(`nutrition.entry.inMeal.${entry.meal}`)} · ${t('nutrition.amount.per100g', {
        calories: format(entry.per100g.calories),
      })}`}
      // The values it was logged with, as the database counts the entry by them (ADR 0034).
      per100g={entry.per100g}
      portions={portionsOf(entry, food.data?.portions ?? [])}
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
          <Note tone="danger">{t('nutrition.entry.removeError')}</Note>
        ) : undefined
      }
      onSubmit={(amount) =>
        updateEntry
          .mutateAsync({ id: entry.id, day: entry.day, amount })
          .then(onSaved)
          .catch(() => {})
      }
    >
      <Button
        label={t('nutrition.entry.remove')}
        variant="ghost"
        loading={removing}
        onPress={onRemove}
      />
    </AmountForm>
  );
}
