import { useTranslation } from 'react-i18next';

import { Note } from '@/components/ui/note';
import { isDbError } from '@/lib/errors';

/** Why a food could not be added to a meal, from the error of `useAddEntry`. */
export function AddEntryError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  return (
    <Note tone="danger">
      {isDbError(error, 'closedDay')
        ? t('nutrition.addError.closedDay')
        : isDbError(error, 'foodArchived')
          ? t('nutrition.addError.archived')
          : t('nutrition.addError.failed')}
    </Note>
  );
}
