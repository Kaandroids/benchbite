import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet } from '@/components/ui/sheet';
import { StepButtons } from '@/components/ui/step-buttons';
import { Text } from '@/components/ui/text';
import { useExerciseCaption } from '@/exercises/caption';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { InfoButton } from '@/exercises/info-button';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import type { DraftExercise } from './draft';

const LIMITS = {
  sets: { min: 1, max: 10, step: 1 },
  reps: { min: 1, max: 100, step: 1 },
  rest: { min: 0, max: 600, step: 15 },
  seconds: { min: 5, max: 3600, step: 15 },
  meters: { min: 100, max: 100000, step: 100 },
};

type ExerciseSheetProps = {
  exercise: DraftExercise | null;
  details: LibraryExercise | undefined;
  onChange: (exercise: DraftExercise) => void;
  onRemove: () => void;
  onClose: () => void;
};

/** The sets, target and rest of one exercise of the workout being edited, in a bottom sheet. */
export function ExerciseSheet({
  exercise,
  details,
  onChange,
  onRemove,
  onClose,
}: ExerciseSheetProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const caption = useExerciseCaption();
  const { format } = useNumberFormat();

  if (!exercise) {
    return null;
  }
  const { target } = exercise;
  const set = (change: Partial<DraftExercise>) => onChange({ ...exercise, ...change });
  const step = (value: number, delta: number, limits: { min: number; max: number }) =>
    clamp(value + delta, limits.min, limits.max);

  type Row = {
    label: string;
    value: string;
    decrease: () => void;
    increase: () => void;
    canDecrease: boolean;
    canIncrease: boolean;
  };
  const row = (
    label: string,
    value: number,
    limits: { min: number; max: number; step: number },
    apply: (next: number) => void,
    shown: string = String(value),
  ): Row => ({
    label,
    value: shown,
    decrease: () => apply(step(value, -limits.step, limits)),
    increase: () => apply(step(value, limits.step, limits)),
    canDecrease: value > limits.min,
    canIncrease: value < limits.max,
  });

  const rows: Row[] = [row(t('editor.sets'), exercise.sets, LIMITS.sets, (sets) => set({ sets }))];
  if ('reps' in target) {
    const { min, max } = target.reps;
    rows.push(
      row(t('editor.repsFrom'), min, LIMITS.reps, (next) =>
        set({ target: { reps: { min: next, max: Math.max(max, next) } } }),
      ),
      row(t('editor.repsTo'), max, { ...LIMITS.reps, min }, (next) =>
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
        row(
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
      row(
        t('editor.time'),
        seconds.value,
        seconds,
        (next) => set({ target: { ...target, seconds: next === 0 ? null : next } }),
        target.seconds === null ? '–' : minutesAndSeconds(target.seconds),
      ),
    );
  }
  rows.push(
    row(
      t('editor.rest'),
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

      <Card list>
        {rows.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.row,
              {
                gap: spacing.md,
                paddingVertical: spacing.sm,
                borderTopWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                borderTopColor: colors.border,
              },
            ]}
          >
            <Text variant="bodyStrong" style={styles.label}>
              {item.label}
            </Text>
            <Text
              variant="headline"
              style={styles.value}
              accessibilityLabel={`${item.label} ${item.value}`}
            >
              {item.value}
            </Text>
            <StepButtons
              size={44}
              onDecrease={item.decrease}
              onIncrease={item.increase}
              canDecrease={item.canDecrease}
              canIncrease={item.canIncrease}
              decreaseLabel={t('editor.less', { label: item.label })}
              increaseLabel={t('editor.more', { label: item.label })}
            />
          </View>
        ))}
      </Card>

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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
  value: {
    minWidth: 64,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
  },
  action: {
    flex: 1,
  },
});
