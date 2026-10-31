import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { pickPhotos, type PhotoSource } from '@/lib/photos';
import { useTheme } from '@/theme';

type PhotoSheetProps = {
  /** What the photos are for, and the line under it, as each place that asks for them says. */
  title: string;
  hint: string;
  /** How many photos may be chosen from the library. */
  limit: number;
  /** Called with the photos taken or chosen; not when none were. */
  onPick: (photos: string[]) => void;
  onClose: () => void;
};

/** Takes a photo with the camera, or chooses up to `limit` from the library. */
export function PhotoSheet({ title, hint, limit, onPick, onClose }: PhotoSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();

  const pick = (source: PhotoSource) => {
    onClose();
    // The camera and the library are screens of their own, which iOS shows only once the sheet
    // has closed.
    afterSheetCloses(() => {
      pickPhotos(source, limit)
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
          {title}
        </Text>
        <Text variant="body" color="textMuted">
          {hint}
        </Text>
      </View>
      <View style={{ gap: spacing.md }}>
        <Button label={t('photoSheet.take')} onPress={() => pick('camera')} />
        <Button
          label={t('photoSheet.choose')}
          variant="secondary"
          onPress={() => pick('library')}
        />
        <Button label={t('photoSheet.cancel')} variant="ghost" onPress={onClose} />
      </View>
    </Sheet>
  );
}
