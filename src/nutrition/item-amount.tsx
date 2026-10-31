import { useTranslation } from 'react-i18next';
import { Modal } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useNumberFormat } from '@/i18n/units';

import { AmountForm } from './amount-form';
import { per100Totals, type EstimateItem } from './meal-estimate';
import { totalOf, useDayEntries } from './meals';
import { useDayTargets } from './targets';

/**
 * Changes an item's grams of an estimated meal, in the form that adds a food, over what shows it:
 * Nutrition's photo, and Bite's meal card in the chat.
 */
export function ItemAmount({
  item,
  day,
  onClose,
  onSave,
}: {
  item: EstimateItem;
  day: string;
  onClose: () => void;
  onSave: (grams: number) => void;
}) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const entries = useDayEntries(day);
  const targets = useDayTargets(day);
  const per100g = per100Totals(item.per100);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* On iOS, a screen in a full-screen modal gets no safe area without a provider of its own. */}
      <SafeAreaProvider>
        <AmountForm
          title={item.name}
          subtitle={t('nutrition.amount.per100g', { calories: format(per100g.calories) })}
          onBack={onClose}
          per100g={per100g}
          // An estimate is in grams.
          portions={[]}
          initial={{ grams: item.grams, portion: null }}
          eatenCalories={totalOf(entries.data ?? []).calories}
          targetCalories={targets.data?.calories ?? null}
          submitLabel={t('nutrition.photo.saveAmount')}
          submitting={false}
          onSubmit={({ grams }) => onSave(grams)}
        />
      </SafeAreaProvider>
    </Modal>
  );
}
