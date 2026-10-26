import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { HistoryButton } from '@/exercises/history-button';
import { InfoButton } from '@/exercises/info-button';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import { summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import { AddSetButton, SetHeader } from '@/sets/set-table';
import { fonts, useTheme } from '@/theme';
import { useRestFormat, useTargetFormat } from '@/workouts/format';

import { newRecords } from './records';
import {
  addSet,
  clockSeconds,
  isExerciseDone,
  setValues,
  startClock,
  stopClock,
  toggleDone,
  updateSession,
  type Session,
  type SessionExercise,
} from './session';
import { SetRow } from './set-row';

type ExerciseProps = {
  exercise: SessionExercise;
  /** Its place in the workout. */
  index: number;
  info: LibraryExercise | undefined;
};

/** An exercise that is not open: its sets done and best so far, and whether it is done. */
export function FoldedExercise({ exercise, index, info }: ExerciseProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const formatTarget = useTargetFormat();
  const kind = setKindOf(info?.metrics, exercise.target);
  const done = exercise.sets.filter((s) => s.done);
  const finished = isExerciseDone(exercise);
  const { best } = summarizeSets(done, kind);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={info?.name}
      onPress={() => updateSession((current) => ({ ...current, current: index }))}
      style={[
        styles.folded,
        {
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <ExerciseThumbnail path={thumbnailOf(info)} size={48} name={info?.name} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {info?.name ?? ''}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.semibold}>
          {done.length === 0
            ? formatTarget(exercise.sets.length, exercise.target)
            : [
                t('session.setsDone', { done: done.length, count: exercise.sets.length }),
                best ? t('session.best', { set: describeSet(best, kind) }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
        </Text>
      </View>
      <View
        style={[
          styles.mark,
          finished
            ? { backgroundColor: colors.primaryButton }
            : { borderWidth: 2, borderColor: colors.border },
        ]}
      >
        {finished ? <Icon name="check" size={16} color="onPrimary" /> : null}
      </View>
    </Pressable>
  );
}

/**
 * The open exercise: each set to fill in and tick, timed sets with their clock, the new records
 * marked, and a button to add a set.
 */
export function OpenExercise({
  exercise,
  index,
  info,
  clock,
  now,
}: ExerciseProps & { clock: Session['clock']; now: number }) {
  const { colors, radii, spacing } = useTheme();
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();
  const kind = setKindOf(info?.metrics, exercise.target);
  const { bySet: records } = newRecords(exercise.sets, kind, exercise.bests);
  return (
    <View
      style={[
        styles.open,
        {
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: colors.surface,
          borderColor: colors.primaryButton,
        },
      ]}
    >
      <View style={[styles.row, { gap: spacing.md }]}>
        <ExerciseThumbnail path={thumbnailOf(info)} size={48} name={info?.name} />
        <View style={styles.flex}>
          <Text variant="label">{info?.name ?? ''}</Text>
          <Text variant="captionStrong" color="primaryText">
            {[
              formatTarget(exercise.sets.length, exercise.target),
              formatRest(exercise.restSeconds),
            ].join(' · ')}
          </Text>
        </View>
        <View style={[styles.row, { gap: spacing.sm }]}>
          <HistoryButton
            exerciseId={exercise.exerciseId}
            exerciseName={info?.name ?? ''}
            inSession
          />
          <InfoButton exerciseId={exercise.exerciseId} exerciseName={info?.name ?? ''} inSession />
        </View>
      </View>

      <SetHeader kind={kind} showLast />

      {exercise.sets.map((set, setIndex) => {
        const running =
          clock?.exercise === index && clock.set === setIndex ? clockSeconds(clock, now) : null;
        return (
          <SetRow
            key={setIndex}
            number={setIndex + 1}
            set={set}
            kind={kind}
            last={exercise.last[setIndex]}
            clock={running}
            records={records.get(setIndex)}
            onChange={(values) =>
              updateSession((current) => setValues(current, index, setIndex, values))
            }
            onToggle={() => {
              void Haptics.selectionAsync();
              updateSession((current) => toggleDone(current, index, setIndex));
            }}
            onClock={() => {
              void Haptics.selectionAsync();
              updateSession((current) =>
                running === null ? startClock(current, index, setIndex) : stopClock(current),
              );
            }}
          />
        );
      })}

      <AddSetButton
        count={exercise.sets.length}
        onPress={() => updateSession((current) => addSet(current, index))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  folded: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  open: {
    borderWidth: 2,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
