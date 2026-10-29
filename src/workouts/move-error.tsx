import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/text';
import { isDbError } from '@/lib/errors';
import type { WorkoutMove } from './week-schedule';

type MoveErrorProps = {
  /** The move that failed, with its error, from `useMoveWorkout`. */
  move: { isError: boolean; error: unknown; variables?: WorkoutMove };
};

/** Why moving or skipping a workout failed, or nothing while it hasn't. */
export function MoveError({ move }: MoveErrorProps) {
  const { t } = useTranslation();
  if (!move.isError) {
    return null;
  }
  let message;
  if (move.variables?.toOn === null) {
    message = t('today.move.skipError');
  } else if (isDbError(move.error, 'moveDoesNotFit')) {
    // The day may have been taken elsewhere since the week loaded.
    message = t('today.move.taken');
  } else {
    message = t('today.move.error');
  }
  return (
    <Text variant="caption" color="danger" accessibilityRole="alert">
      {message}
    </Text>
  );
}
