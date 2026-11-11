import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ActionCard } from '@/components/ui/action-card';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { toIsoDate, useWeekdayFormat, weekdayOf } from '@/i18n/dates';
import { createQuestion } from '@/lib/question';
import { useTheme } from '@/theme';
import { useCachedWeekSchedule } from '@/week/use-week-schedule';
import { useWorkoutName } from '@/workouts/format';
import { startMove, undoesSkipOfToday, type StartMove } from '@/workouts/week-schedule';
import type { Workout } from '@/workouts/workouts';

/** A workout started on a day it is not planned, and the planned day it could count for. */
export type StartMoveQuestion = StartMove & { name: string };

/** Moved to today, kept as an extra workout, or not started. */
export type StartMoveAnswer = 'move' | 'extra' | null;

const moveQuestion = createQuestion<StartMoveQuestion, StartMoveAnswer>(null);

/**
 * Asks whether a workout started today counts for its planned day (ADR 0028), in the sheet of
 * `StartMoveSheet`, and resolves with the answer. A question still open is cancelled by a new one.
 */
export const askStartMove = moveQuestion.ask;

/**
 * For a workout about to start on `today`, asks whether it counts for a planned day this week, as
 * the week is cached at the time. Resolves with the day it moves from, none for an extra workout or
 * when there is nothing to ask, or null when it is not to start.
 */
export function useStartMove() {
  const cachedWeek = useCachedWeekSchedule();
  const workoutName = useWorkoutName();
  return async (workout: Workout, today: Date): Promise<{ fromOn?: string } | null> => {
    // Without the week, as offline before it ever loaded, the workout is an extra one.
    const schedule = cachedWeek(today);
    const move = schedule ? startMove(schedule, workout.id, toIsoDate(today)) : null;
    if (!move) {
      return {};
    }
    // A workout skipped today is today's again once started, without asking.
    if (undoesSkipOfToday(move, toIsoDate(today))) {
      return { fromOn: move.fromOn };
    }
    const answer = await askStartMove({ name: workoutName(workout), ...move });
    return answer === null ? null : answer === 'move' ? { fromOn: move.fromOn } : {};
  };
}

/** The sheet that asks `askStartMove`'s question, over every screen. */
export function StartMoveSheet() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const current = moveQuestion.useQuestion();
  if (!current) {
    return null;
  }
  const { question, answer } = current;
  const day = weekdayName(weekdayOf(question.on));
  const values = { name: question.name, day };

  return (
    <Sheet onClose={() => answer(null)}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          {t('session.startMove.title', values)}
        </Text>
        <Text color="textMuted">
          {t(question.missed ? 'session.startMove.missed' : 'session.startMove.later', values)}
        </Text>
      </View>
      <Button label={t('session.startMove.move')} onPress={() => answer('move')} />
      <ActionCard
        icon="plus"
        title={t('session.startMove.extra')}
        hint={t(
          question.missed ? 'session.startMove.extraMissed' : 'session.startMove.extraLater',
          values,
        )}
        onPress={() => answer('extra')}
      />
      <Button variant="ghost" label={t('session.startMove.cancel')} onPress={() => answer(null)} />
    </Sheet>
  );
}
