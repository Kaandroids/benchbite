import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RoundIconButton } from '@/components/ui/round-icon-button';

type HistoryButtonProps = {
  exerciseId: string;
  exerciseName: string;
  /** Called before the history opens, for example to close a sheet. */
  onOpen?: () => void;
};

/** A small grey chart that opens an exercise's records and progress. */
export function HistoryButton({ exerciseId, exerciseName, onOpen }: HistoryButtonProps) {
  const { t } = useTranslation();
  return (
    <RoundIconButton
      icon="trend"
      color="textMuted"
      background="track"
      label={t('exercise.history', { name: exerciseName })}
      onPress={() => {
        onOpen?.();
        router.push({ pathname: '/workout/exercise/history', params: { id: exerciseId } });
      }}
    />
  );
}
