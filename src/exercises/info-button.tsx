import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RoundIconButton } from '@/components/ui/round-icon-button';

type InfoButtonProps = {
  exerciseId: string;
  exerciseName: string;
  /**
   * Opens it over the workout in progress, whose screen covers the Workout tab, so that going back
   * returns to the workout.
   */
  inSession?: boolean;
  /** Called before the details open, for example to close a sheet. */
  onOpen?: () => void;
};

/** A small blue "i" that opens how to do an exercise. */
export function InfoButton({
  exerciseId,
  exerciseName,
  inSession = false,
  onOpen,
}: InfoButtonProps) {
  const { t } = useTranslation();
  return (
    <RoundIconButton
      icon="info"
      color="info"
      background="infoBackground"
      label={t('exercise.details', { name: exerciseName })}
      onPress={() => {
        onOpen?.();
        router.push({
          pathname: inSession ? '/session/exercise/[id]' : '/workout/exercise/[id]',
          params: { id: exerciseId },
        });
      }}
    />
  );
}
