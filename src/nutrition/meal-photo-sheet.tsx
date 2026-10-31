import { MAX_PHOTOS } from '@shared/photos';
import { useTranslation } from 'react-i18next';

import { PhotoSheet } from '@/components/photo-sheet';

type MealPhotoSheetProps = {
  /** Called with the photos taken or chosen; not when none were. */
  onPick: (photos: string[]) => void;
  onClose: () => void;
};

/** Takes a photo of a meal or chooses up to three from the library, to estimate it (#299). */
export function MealPhotoSheet({ onPick, onClose }: MealPhotoSheetProps) {
  const { t } = useTranslation();
  return (
    <PhotoSheet
      title={t('nutrition.photo.sheetTitle')}
      hint={t('nutrition.photo.sheetHint')}
      limit={MAX_PHOTOS}
      onPick={onPick}
      onClose={onClose}
    />
  );
}
