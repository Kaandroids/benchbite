import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { RaisedPressable } from '@/components/ui/raised-pressable';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { toIsoDate, useWeekdayFormat, weekdayOf } from '@/i18n/dates';
import { useTheme } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { useCachedWeekSchedule } from '@/workouts/use-week-schedule';
import { startMove, type StartMove } from '@/workouts/week-schedule';
import type { Workout } from '@/workouts/workouts';

/** A workout started on a day it is not planned, and the planned day it could count for. */
export type StartMoveQuestion = StartMove & { name: string };

/** Moved to today, kept as an extra workout, or not started. */
export type StartMoveAnswer = 'move' | 'extra' | null;

let pending: { question: StartMoveQuestion; answer: (value: StartMoveAnswer) => void } | null =
  null;
const listeners = new Set<() => void>();

function setPending(value: typeof pending) {
  pending = value;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Asks whether a workout started today counts for its planned day (ADR 0028), in the sheet of
 * `StartMoveSheet`, and resolves with the answer.
 */
export function askStartMove(question: StartMoveQuestion): Promise<StartMoveAnswer> {
  // A question still open is cancelled by a new one.
  pending?.answer(null);
  return new Promise((resolve) => {
    setPending({
      question,
      answer: (value) => {
        setPending(null);
        resolve(value);
      },
    });
  });
}

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
    const answer = await askStartMove({ name: workoutName(workout), ...move });
    return answer === null ? null : answer === 'move' ? { fromOn: move.fromOn } : {};
  };
}

/** The sheet that asks `askStartMove`'s question, over every screen. */
export function StartMoveSheet() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat();
  const current = useSyncExternalStore(subscribe, () => pending);
  // A question left open when the sheet goes, as on signing out, is not answered later.
  useEffect(() => () => pending?.answer(null), []);
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
      <RaisedPressable
        accessibilityRole="button"
        accessibilityLabel={t('session.startMove.extra')}
        onPress={() => answer('extra')}
        ledgeColor={colors.border}
        borderRadius={radii.lg}
        faceStyle={[
          styles.option,
          {
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.lg,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <IconTile name="plus" size={40} />
        <View style={styles.text}>
          <Text variant="bodyStrong">{t('session.startMove.extra')}</Text>
          <Text variant="caption" color="textMuted">
            {t(
              question.missed ? 'session.startMove.extraMissed' : 'session.startMove.extraLater',
              values,
            )}
          </Text>
        </View>
      </RaisedPressable>
      <Button variant="ghost" label={t('session.startMove.cancel')} onPress={() => answer(null)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
