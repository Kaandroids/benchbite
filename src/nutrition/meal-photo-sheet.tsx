import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { pickMealPhotos, type PhotoSource } from './meal-estimate';

type MealPhotoSheetProps = {
  /** Called with the photos taken or chosen; not when none were. */
  onPick: (photos: string[]) => void;
  onClose: () => void;
  /** The sheet's title and the line under it, a meal's unless given, as Bite's chat gives them. */
  title?: string;
  hint?: string;
  /** How many photos may be chosen, `MAX_PHOTOS` unless fewer. */
  limit?: number;
};

/**
 * Takes a photo or chooses up to three from the library: of a meal, to estimate it, or to send to
 * Bite in the chat (#299).
 */
export function MealPhotoSheet({ onPick, onClose, title, hint, limit }: MealPhotoSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();

  const pick = (source: PhotoSource) => {
    onClose();
    // The camera and the library are screens of their own, which iOS shows only once the sheet
    // has closed.
    afterSheetCloses(() => {
      pickMealPhotos(source, limit)
        .then((photos) => {
          if (photos.length > 0) {
            onPick(photos);
          }
        })
        // A picker that fails to open leaves the screen as it was.
        .catch(() => {});
    });
  };

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          {title ?? t('nutrition.photo.sheetTitle')}
        </Text>
        <Text variant="body" color="textMuted">
          {hint ?? t('nutrition.photo.sheetHint')}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>
        <Button label={t('nutrition.photo.take')} onPress={() => pick('camera')} />
        <Button
          label={t('nutrition.photo.choose')}
          variant="secondary"
          onPress={() => pick('library')}
        />
        <Button label={t('nutrition.photo.cancel')} variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
