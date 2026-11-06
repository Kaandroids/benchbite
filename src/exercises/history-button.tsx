import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RoundIconButton } from '@/components/ui/round-icon-button';

type HistoryButtonProps = {
  exerciseId: string;
  exerciseName: string;
  /**
   * Opens it over the workout in progress, whose screen covers the Workout tab, so that going back
   * returns to the workout.
   */
  inSession?: boolean;
  /** Called before the history opens, for example to close a sheet. */
  onOpen?: () => void;
  /** The button's width and height, for a row that needs it to match a picture. */
  size?: number;
};

/** A small indigo chart that opens an exercise's records and progress. */
export function HistoryButton({
  exerciseId,
  exerciseName,
  inSession = false,
  onOpen,
  size,
}: HistoryButtonProps) {
  const { t } = useTranslation();
  return (
    <RoundIconButton
      icon="trend"
      color="dinner"
      background="dinnerBackground"
      size={size}
      label={t('exercise.history', { name: exerciseName })}
      onPress={() => {
        onOpen?.();
        router.push({
          pathname: inSession ? '/session/exercise/history' : '/workout/exercise/history',
          params: { id: exerciseId },
        });
      }}
    />
  );
}
