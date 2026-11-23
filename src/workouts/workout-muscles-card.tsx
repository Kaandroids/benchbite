import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { ZONES } from '@/exercises/body-map';
import { MuscleMap } from '@/exercises/muscle-map';
import type { Database } from '@/lib/database.types';
import { useTheme } from '@/theme';

type Muscle = Database['public']['Enums']['muscle'];

/** The height of each figure, in points. */
const HEIGHT = 190;
const [, , ZONE_WIDTH, ZONE_HEIGHT] = ZONES.whole;
const WIDTH = Math.round((HEIGHT * ZONE_WIDTH) / ZONE_HEIGHT);

type WorkoutMusclesCardProps = {
  primary: readonly Muscle[];
  secondary: readonly Muscle[];
};

/**
 * The muscles a workout trains, on the body from the front and the back, and in words below: the
 * ones its exercises train first and the ones that only help (#304).
 */
export function WorkoutMusclesCard({ primary, secondary }: WorkoutMusclesCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const names = (muscles: readonly Muscle[]) =>
    muscles.map((muscle) => t(`workout.muscles.${muscle}`)).join(', ');
  const legend = (color: string, text: string) => (
    <View style={[styles.legend, { gap: spacing.sm }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text variant="caption" color="textMuted" style={styles.shrink}>
        {text}
      </Text>
    </View>
  );
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={[styles.figures, { gap: spacing.lg }]}>
        {(['front', 'back'] as const).map((side) => (
          <MuscleMap
            key={side}
            primary={primary}
            secondary={secondary}
            side={side}
            width={WIDTH}
            height={HEIGHT}
          />
        ))}
      </View>
      <View style={{ gap: spacing.xs }}>
        {legend(colors.primary, t('workout.muscleMap.mainly', { muscles: names(primary) }))}
        {secondary.length > 0
          ? legend(
              colors.figureSecondary,
              t('workout.muscleMap.also', { muscles: names(secondary) }),
            )
          : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  figures: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  shrink: {
    flex: 1,
  },
});
