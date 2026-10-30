import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { AlternativeChips } from './alternative-chips';
import { useAlternativeError, useSwitchAlternative, useWorkoutAlternatives } from './alternatives';

type WorkoutAlternativesProps = {
  workoutId: number;
  /** Whether the workout is running, which a switch would change under it. */
  running: boolean;
  /** Called instead of a switch while the workout is running, to have it finished first. */
  onRunning: () => void;
};

/**
 * The chips of a workout's alternatives, to put another in use, and why a switch failed. Nothing
 * for a workout without alternatives, which has no rows and never a single one (ADR 0061).
 */
export function WorkoutAlternatives({ workoutId, running, onRunning }: WorkoutAlternativesProps) {
  const { spacing } = useTheme();
  const alternatives = useWorkoutAlternatives(workoutId);
  const switchAlternative = useSwitchAlternative();
  const alternativeError = useAlternativeError();

  const shown = alternatives.data;
  if (!shown || shown.length < 2) {
    return null;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <AlternativeChips
        alternatives={shown}
        // The one being switched to shows as chosen until the workout has loaded with it.
        selectedId={
          switchAlternative.isPending
            ? switchAlternative.variables
            : shown.find((alternative) => alternative.inUse)?.id
        }
        disabled={switchAlternative.isPending}
        onSelect={(alternative) => {
          // Like an edit, a switch would change the exercises of the workout running.
          if (running) {
            onRunning();
            return;
          }
          switchAlternative.mutate(alternative.id);
        }}
      />
      {switchAlternative.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {alternativeError(switchAlternative.error, 'switch')}
        </Text>
      ) : null}
    </View>
  );
}
