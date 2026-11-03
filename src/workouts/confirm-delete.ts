import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useDeleteWorkout } from './workouts';

type ConfirmDeleteOptions = {
  /** Runs once the user confirms, before the delete, such as to leave the workout's screen. */
  onConfirm?: () => void;
  /** Runs once the workout is deleted, such as to close the editor with it. */
  onDeleted?: () => void;
};

/**
 * Asks before deleting a workout, then deletes it, and says when that failed. `deleting` holds
 * while a delete runs.
 */
export function useConfirmDeleteWorkout() {
  const { t } = useTranslation();
  const remove = useDeleteWorkout();
  const confirm = (id: number, { onConfirm, onDeleted }: ConfirmDeleteOptions = {}) =>
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: () => {
          onConfirm?.();
          remove.mutateAsync(id).then(
            () => onDeleted?.(),
            (error: unknown) => {
              console.warn('Could not delete the workout', error);
              Alert.alert(t('history.deleteErrorTitle'), t('history.deleteError'));
            },
          );
        },
      },
    ]);
  return { confirm, deleting: remove.isPending };
}
