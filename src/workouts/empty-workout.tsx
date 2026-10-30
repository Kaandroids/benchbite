import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useAlternativeName, useWorkoutAlternatives } from './alternatives';

type EmptyWorkoutProps = {
  workoutId: number;
  /** The workout's name, for one without alternatives. */
  name: string;
  /** Opens the editor to add the exercises. */
  onAdd: () => void;
};

/**
 * In place of a workout's exercises while it has none, as when an empty alternative was just put
 * in use: what is missing, that the other alternatives stay as they are, and a button to Edit.
 */
export function EmptyWorkout({ workoutId, name, onAdd }: EmptyWorkoutProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const alternatives = useWorkoutAlternatives(workoutId).data ?? [];
  const nameOf = useAlternativeName();
  const inUse = alternatives.find((alternative) => alternative.inUse);
  const others = alternatives.filter((alternative) => !alternative.inUse);
  const shown = inUse ? nameOf(inUse) : name;
  const [other] = others;
  const body =
    others.length > 1
      ? t('workout.empty.bodyOthers', { name: shown })
      : other
        ? t('workout.empty.bodyOne', { name: shown, other: nameOf(other) })
        : t('workout.empty.body');

  return (
    <Card style={[styles.card, { gap: spacing.sm, paddingVertical: spacing.xl }]}>
      <IconTile name="dumbbell" size={56} color="breakfast" background="breakfastBackground" />
      <Text variant="headline" align="center" accessibilityRole="header">
        {t('workout.empty.title', { name: shown })}
      </Text>
      <Text color="textMuted" align="center">
        {body}
      </Text>
      <Button
        label={t('workout.empty.add')}
        size="small"
        onPress={onAdd}
        style={{ marginTop: spacing.sm }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
  },
});
