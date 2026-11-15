import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { SwitchCard } from '@/components/ui/switch-card';
import { Text } from '@/components/ui/text';
import { useExerciseCaption } from '@/exercises/caption';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { InfoButton } from '@/exercises/info-button';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import type { DraftExercise } from './draft';
import { resizeTargets, type SetTarget } from './set-targets';
import { SetTargetsSection } from './set-targets-section';
import { StepperCard, stepperRow, type StepperRow } from './stepper-card';

const LIMITS = {
  sets: { min: 1, max: 10, step: 1 },
  reps: { min: 1, max: 100, step: 1 },
  rest: { min: 0, max: 600, step: 15 },
  seconds: { min: 5, max: 3600, step: 15 },
  meters: { min: 100, max: 100000, step: 100 },
};

/** How much of the screen's height the sheet's values may take before they scroll. */
const SCROLL_SHARE = 0.6;

type ExerciseSheetProps = {
  exercise: DraftExercise | null;
  details: LibraryExercise | undefined;
  onChange: (exercise: DraftExercise) => void;
  /** Changes its own set targets, from the exercise as it is then. */
  onChangeTargets: (change: (exercise: DraftExercise) => SetTarget[] | null) => void;
  /**
   * The exercise after it, which it can be joined with into a superset (ADR 0137), with whether it
   * is; none for the last exercise.
   */
  next: { name: string; joined: boolean } | null;
  onJoinNext: (joined: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
};

/**
 * The sets, target and rest of one exercise of the workout being edited, its own targets for each
 * set, and whether it is in a superset with the next, in a bottom sheet.
 */
export function ExerciseSheet({
  exercise,
  details,
  onChange,
  onChangeTargets,
  next,
  onJoinNext,
  onRemove,
  onClose,
}: ExerciseSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { height } = useWindowDimensions();
  const caption = useExerciseCaption();
  const { format } = useNumberFormat();

  if (!exercise) {
    return null;
  }
  const { target } = exercise;
  const set = (change: Partial<DraftExercise>) => onChange({ ...exercise, ...change });

  const rows: StepperRow[] = [
    stepperRow(t('editor.sets'), exercise.sets, LIMITS.sets, (sets) =>
      set({ sets, setTargets: resizeTargets(exercise.setTargets, sets) }),
    ),
  ];
  if ('reps' in target) {
    const { min, max } = target.reps;
    rows.push(
      stepperRow(t('editor.repsFrom'), min, LIMITS.reps, (next) =>
        set({ target: { reps: { min: next, max: Math.max(max, next) } } }),
      ),
      stepperRow(t('editor.repsTo'), max, { ...LIMITS.reps, min }, (next) =>
        set({ target: { reps: { min, max: next } } }),
      ),
    );
  } else {
    const distance = details?.metrics.includes('distance') ?? target.meters !== null;
    // A distance exercise may drop either its time or its distance, but not both.
    const optional = (
      value: number | null,
      limits: typeof LIMITS.seconds,
      other: number | null,
    ) => ({
      ...limits,
      min: distance && other !== null ? 0 : limits.min,
      value: value ?? 0,
    });
    if (distance) {
      const meters = optional(target.meters, LIMITS.meters, target.seconds);
      rows.push(
        stepperRow(
          t('editor.distance'),
          meters.value,
          meters,
          (next) => set({ target: { ...target, meters: next === 0 ? null : next } }),
          target.meters === null
            ? '–'
            : target.meters >= 1000
              ? `${format(target.meters / 1000)} km`
              : `${target.meters} m`,
        ),
      );
    }
    const seconds = optional(target.seconds, LIMITS.seconds, target.meters);
    rows.push(
      stepperRow(
        t('editor.time'),
        seconds.value,
        seconds,
        (next) => set({ target: { ...target, seconds: next === 0 ? null : next } }),
        target.seconds === null ? '–' : minutesAndSeconds(target.seconds),
      ),
    );
  }
  rows.push(
    stepperRow(
      // In a superset, the rest after each round, the same for all its exercises.
      exercise.superset != null ? t('editor.restAfterRound') : t('editor.rest'),
      exercise.restSeconds,
      LIMITS.rest,
      (restSeconds) => set({ restSeconds }),
      minutesAndSeconds(exercise.restSeconds),
    ),
  );

  const detail = details ? caption(details) : '';

  return (
    <Sheet onClose={onClose}>
      <View style={[styles.header, { gap: spacing.md }]}>
        <ExerciseThumbnail path={thumbnailOf(details)} size={64} name={details?.name} />
        <View style={styles.title}>
          <Text variant="headline">{details?.name ?? ''}</Text>
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        </View>
        <InfoButton
          exerciseId={exercise.exerciseId}
          exerciseName={details?.name ?? ''}
          onOpen={onClose}
        />
      </View>

      {/* Scrolls once targets for many sets make it taller than the screen. */}
      <ScrollView
        style={{ maxHeight: height * SCROLL_SHARE }}
        contentContainerStyle={{ gap: spacing.lg }}
      >
        <StepperCard rows={rows} />

        <SetTargetsSection exercise={exercise} details={details} onChange={onChangeTargets} />

        {next ? (
          <SwitchCard
            label={t('editor.supersetNext')}
            note={t('editor.supersetNextNote', { name: next.name })}
            value={next.joined}
            onValueChange={onJoinNext}
          />
        ) : null}
      </ScrollView>

      <View style={[styles.actions, { gap: spacing.md }]}>
        <Button
          variant="ghost"
          label={t('editor.remove')}
          onPress={onRemove}
          style={styles.action}
        />
        <Button label={t('editor.done')} onPress={onClose} style={styles.action} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
});
