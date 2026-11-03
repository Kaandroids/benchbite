import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { AlternativeChips } from './alternative-chips';
import { type AlternativeChoice, type WorkoutAlternative } from './alternatives';

type WorkoutAlternativesProps = {
  alternatives: WorkoutAlternative[] | undefined;
  /** The screen's choice of the one in use, which the alternatives sheet shares. */
  choice: AlternativeChoice;
  /** Called for one that waits for premium, instead of putting it in use. */
  onHeld: (alternative: WorkoutAlternative) => void;
};

/**
 * The chips of a workout's alternatives, to put another in use, and why a switch failed. Nothing
 * for a workout without alternatives, which has no rows and never a single one (ADR 0061).
 */
export function WorkoutAlternatives({ alternatives, choice, onHeld }: WorkoutAlternativesProps) {
  const { spacing } = useTheme();
  if (!alternatives || alternatives.length < 2) {
    return null;
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <AlternativeChips
        alternatives={alternatives}
        selectedId={choice.chosenId}
        disabled={choice.isPending}
        onSelect={(alternative) =>
          alternative.held ? onHeld(alternative) : choice.choose(alternative.id)
        }
      />
      {choice.error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {choice.error}
        </Text>
      ) : null}
    </View>
  );
}
