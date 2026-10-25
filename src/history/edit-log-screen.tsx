import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { findExercise, useExerciseLibrary, type LibraryExercise } from '@/exercises/library';
import { useClockFormat } from '@/i18n/dates';
import { fonts } from '@/theme';
import { useWorkoutName } from '@/workouts/format';
import { findWorkout, useWorkouts } from '@/workouts/workouts';

import { EditedExerciseCard } from './edited-exercise';
import {
  useLoggedSets,
  useLogSummary,
  type LoggedExercise,
  type LogSummary,
  withSkipped,
} from './history';
import { useLogEdit } from './use-log-edit';

/** Corrects the sets of a finished workout: their values, and which sets there were. */
export function EditLogScreen({ id }: { id: number }) {
  const { t } = useTranslation();
  const summary = useLogSummary(id);
  const sets = useLoggedSets(id);
  const library = useExerciseLibrary();
  const workouts = useWorkouts();

  if (!allLoaded([summary, sets, library, workouts])) {
    return (
      <Screen onBack={() => router.back()} closes>
        <LoadState queries={[summary, sets, library, workouts]} />
      </Screen>
    );
  }
  if (!summary.data) {
    return (
      <Screen onBack={() => router.back()} closes>
        <MessageView
          icon="dumbbell"
          title={t('history.notFound.title')}
          message={t('history.notFound.message')}
        />
      </Screen>
    );
  }
  const log = summary.data;
  // The exercises the workout had, so that a skipped one can get sets afterwards. Logs saved before
  // they were kept take them from the workout as it is now, as many as it had then.
  const workout = findWorkout(workouts.data, log.workoutId);
  const planned =
    log.plannedExerciseIds ??
    (workout?.exercises ?? [])
      .slice(0, log.plannedExercises ?? undefined)
      .map((exercise) => exercise.exerciseId);
  return (
    <LogEditor
      log={log}
      exercises={withSkipped(sets.data ?? [], planned)}
      library={library.data ?? []}
    />
  );
}

function LogEditor({
  log,
  exercises: initial,
  library,
}: {
  log: LogSummary;
  exercises: LoggedExercise[];
  library: LibraryExercise[];
}) {
  const { t, i18n } = useTranslation();
  const workoutName = useWorkoutName();
  const editor = useLogEdit(log, initial, library);

  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: log.startedAt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(log.startedAt);
  const time = useClockFormat();

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={
        <Text variant="label" accessibilityRole="header" numberOfLines={1}>
          {t('history.edit.title', { name: workoutName(log) })}
        </Text>
      }
      action={
        <PillButton
          variant="primary"
          label={t('editor.save')}
          disabled={!editor.canSave}
          onPress={() => void editor.save()}
        />
      }
    >
      <Text variant="caption" color="textMuted" style={styles.semibold}>
        {`${day} · ${time(log.startedAt)}–${time(log.finishedAt)}. ${t('history.edit.note')}`}
      </Text>
      {editor.setCount === 0 ? (
        <Text color="danger" style={styles.semibold}>
          {t('history.edit.empty')}
        </Text>
      ) : editor.checked && editor.incomplete ? (
        <Text color="danger" style={styles.semibold}>
          {t('history.edit.missing')}
        </Text>
      ) : null}

      {editor.exercises.map((exercise, index) => (
        <EditedExerciseCard
          key={index}
          exercise={exercise}
          info={findExercise(library, exercise.exerciseId)}
          kind={editor.kindOf(exercise.exerciseId)}
          checked={editor.checked}
          onChangeSets={(change) => editor.changeSets(index, change)}
          onAddSet={() => editor.addSet(index)}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  semibold: {
    fontFamily: fonts.bold,
  },
});
