import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { Card, type CardProps } from '@/components/ui/card';
import { useTheme } from '@/theme';

import { OutsideTodayRow } from './outside-workout-row';
import { OutsideWorkoutSheet } from './outside-workout-sheet';
import type { ListedOutsideWorkout } from './outside-workouts';

/**
 * Today's workouts from other apps, under Today's own (#468, ADR 0106): each with its time, length,
 * calories and source, opening its details. Nothing without any.
 */
export function AlsoTodayCard({
  workouts,
  entering,
}: {
  workouts: ListedOutsideWorkout[];
  entering?: CardProps['entering'];
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [open, setOpen] = useState<ListedOutsideWorkout | null>(null);
  if (workouts.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }}>
      <Caption accessibilityRole="header">{t('health.outside.alsoToday')}</Caption>
      <Card list entering={entering}>
        {workouts.map((workout, index) => (
          <OutsideTodayRow
            key={workout.key}
            workout={workout}
            divider={index > 0}
            onPress={() => setOpen(workout)}
          />
        ))}
      </Card>
      {open ? <OutsideWorkoutSheet workout={open} onClose={() => setOpen(null)} /> : null}
    </View>
  );
}
