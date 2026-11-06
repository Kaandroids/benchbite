import { useTranslation } from 'react-i18next';

import { Note } from '@/components/ui/note';
import { dbErrorMessage } from '@/lib/errors';

/**
 * Why a food could not be added to a meal, from the error of `useAddEntry` or of logging a meal
 * estimate, which saves a food the library lacks as the user's own and so can reach their limits.
 */
export function AddEntryError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Note tone="danger">
      {dbErrorMessage(
        error,
        [
          ['closedDay', t('nutrition.addError.closedDay')],
          ['foodArchived', t('nutrition.addError.archived')],
          ['customFoodLimit', t('nutrition.addError.foodLimit')],
          ['customFoodTotalLimit', t('nutrition.addError.foodTotalLimit')],
        ],
        t('nutrition.addError.failed'),
      )}
    </Note>
  );
}
