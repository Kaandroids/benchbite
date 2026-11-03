import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useDeleteWorkout } from './workouts';

/**
 * Asks before deleting a workout, then deletes it; `onConfirm` runs first, such as to leave the
 * workout's screen, so that the deleted workout never shows as not found.
 */
export function useConfirmDeleteWorkout() {
  const { t } = useTranslation();
  const remove = useDeleteWorkout();
  return (id: number, onConfirm?: () => void) =>
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: () => {
          onConfirm?.();
          remove.mutateAsync(id).catch((error: unknown) => {
            console.warn('Could not delete the workout', error);
            Alert.alert(t('history.deleteErrorTitle'), t('history.deleteError'));
          });
        },
      },
    ]);
}
