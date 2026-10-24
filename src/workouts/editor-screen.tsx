import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { ReorderList } from '@/components/ui/reorder-list';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { thumbnailOf, useExerciseLibrary, findExercise } from '@/exercises/library';
import { isDbError } from '@/lib/errors';
import { useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import { typography, useTheme } from '@/theme';

import { clearDraft, startDraft, updateDraft, useDraft, type DraftExercise } from './draft';
import { ExerciseSheet } from './exercise-sheet';
import { useRestFormat, useTargetFormat, useWorkoutName } from './format';
import {
  useDeleteWorkout,
  useWorkoutLimits,
  useSaveWorkout,
  useWorkouts,
  findWorkout,
} from './workouts';

const ROW_HEIGHT = 76;

/** Creates a workout, or edits the name, days and exercises of the one with the id. */
export function EditorScreen({ id }: { id?: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const library = useExerciseLibrary();
  const limits = useWorkoutLimits();
  const draft = useDraft();
  const save = useSaveWorkout();
  const remove = useDeleteWorkout();
  const workoutName = useWorkoutName();
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();
  const weekdayName = useWeekdayFormat('narrow');
  const longWeekdayName = useWeekdayFormat('long');
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const workout = findWorkout(workouts.data, id);
  // A workout from the plan builder is named by its type until the user gives it a name.
  const typeName = workout && workout.name === null ? workoutName(workout) : null;
  const loaded = allLoaded([workouts, library, limits]);

  // Starts the draft once the workout is loaded.
  useEffect(() => {
    if (!loaded || (id !== undefined && !workout)) {
      return;
    }
    startDraft(
      workout
        ? {
            id: workout.id,
            name: workout.name ?? '',
            weekdays: workout.weekdays,
            exercises: workout.exercises.map(({ exerciseId, sets, target, restSeconds }) => ({
              exerciseId,
              sets,
              target,
              restSeconds,
            })),
          }
        : { name: '', weekdays: [], exercises: [] },
    );
    // Only when the screen opens or the workout first loads, not on every change of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, workout?.id]);

  useEffect(() => clearDraft, []);

  const details = (exerciseId: string) => findExercise(library.data, exerciseId);
  const close = () => router.back();
  const max = limits.data?.exercises ?? 0;
  const over = draft ? draft.exercises.length - max : 0;
  const canSave =
    !!draft &&
    (draft.name.trim() !== '' || typeName !== null) &&
    draft.exercises.length > 0 &&
    over <= 0;

  const onSave = async () => {
    if (!draft) {
      return;
    }
    try {
      await save.mutateAsync({
        ...(draft.id !== undefined ? { id: draft.id } : {}),
        name: draft.name.trim() || null,
        weekdays: draft.weekdays,
        exercises: draft.exercises.map(({ key: _key, ...exercise }) => exercise),
      });
      router.back();
    } catch (error) {
      console.warn('Could not save the workout', error);
      // The limits can change after they were loaded, or another device can add a workout.
      Alert.alert(
        t('editor.saveErrorTitle'),
        isDbError(error, 'exerciseLimit')
          ? t('editor.limit', { max })
          : isDbError(error, 'workoutLimit')
            ? t('workout.limit', { max: limits.data?.workouts ?? 0 })
            : t('editor.saveError'),
      );
    }
  };

  const onDelete = () => {
    if (draft?.id === undefined) {
      return;
    }
    const workoutId = draft.id;
    Alert.alert(t('editor.deleteTitle'), t('editor.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('editor.delete'),
        style: 'destructive',
        onPress: () =>
          void remove.mutateAsync(workoutId).then(
            // Closes the editor and the deleted workout, back to the list it was opened from.
            () => router.dismiss(2),
            (error: unknown) => console.warn('Could not delete the workout', error),
          ),
      },
    ]);
  };

  const editingExercise = draft?.exercises.find((exercise) => exercise.key === editing) ?? null;
  const setExercises = (change: (exercises: DraftExercise[]) => DraftExercise[]) =>
    updateDraft((current) => ({ ...current, exercises: change(current.exercises) }));

  const exerciseRow = (exercise: DraftExercise) => {
    const info = details(exercise.exerciseId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={info?.name}
        onPress={() => setEditing(exercise.key)}
        style={[styles.exercise, { gap: spacing.md }]}
      >
        <ExerciseThumbnail path={thumbnailOf(info)} size={52} name={info?.name} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {info?.name ?? ''}
          </Text>
          <Text variant="captionStrong" color="primaryText">
            {formatTarget(exercise.sets, exercise.target)}
          </Text>
          <Text variant="caption" color="textMuted">
            {formatRest(exercise.restSeconds)}
          </Text>
        </View>
        <Icon name="forward" size={18} color="textMuted" />
      </Pressable>
    );
  };

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={close}
          style={styles.close}
        >
          <Icon name="close" color="textMuted" />
        </Pressable>
        <Text variant="label" accessibilityRole="header" style={styles.flex} align="center">
          {id === undefined ? t('editor.newTitle') : t('editor.editTitle')}
        </Text>
        <PillButton
          variant="primary"
          label={t('editor.save')}
          disabled={!canSave || save.isPending}
          onPress={() => void onSave()}
        />
      </View>

      {loaded && id !== undefined && !workout && !draft ? (
        <MessageView
          icon="dumbbell"
          title={t('workout.notFound.title')}
          message={t('workout.notFound.message')}
        />
      ) : !loaded || !draft ? (
        <View style={[styles.flex, { padding: spacing.xl }]}>
          <LoadState queries={[workouts, library, limits]} />
        </View>
      ) : (
        <ScrollView
          scrollEnabled={!dragging}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.sm }}>
            <Text variant="captionStrong" color="textMuted">
              {t('editor.name')}
            </Text>
            <TextInput
              accessibilityLabel={t('editor.name')}
              value={draft.name}
              onChangeText={(name) => updateDraft((current) => ({ ...current, name }))}
              placeholder={typeName ?? t('editor.namePlaceholder')}
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              style={[
                styles.input,
                typography.bodyStrong,
                {
                  borderRadius: radii.md,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  color: colors.text,
                  paddingHorizontal: spacing.lg,
                },
              ]}
            />
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="captionStrong" color="textMuted">
              {t('editor.days')}
            </Text>
            <View style={[styles.days, { gap: spacing.xs }]}>
              {range(1, 7).map((weekday) => {
                const on = draft.weekdays.includes(weekday);
                return (
                  <Pressable
                    key={weekday}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={longWeekdayName(weekday)}
                    onPress={() =>
                      updateDraft((current) => ({
                        ...current,
                        weekdays: on
                          ? current.weekdays.filter((day) => day !== weekday)
                          : [...current.weekdays, weekday].sort((a, b) => a - b),
                      }))
                    }
                    style={[
                      styles.day,
                      {
                        borderRadius: radii.full,
                        backgroundColor: on ? colors.primaryButton : colors.surface,
                        borderColor: on ? colors.primaryButton : colors.border,
                      },
                    ]}
                  >
                    <Text variant="label" color={on ? 'onPrimary' : 'text'}>
                      {weekdayName(weekday)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text variant="caption" color="textMuted">
              {t('editor.daysHint')}
            </Text>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text variant="captionStrong" color="textMuted">
              {t('editor.exercises', { count: draft.exercises.length })}
            </Text>
            {draft.exercises.length > 0 ? (
              <Card list style={{ paddingHorizontal: spacing.md }}>
                <ReorderList
                  items={draft.exercises}
                  keyOf={(exercise) => exercise.key}
                  rowHeight={ROW_HEIGHT}
                  labelOf={(exercise) => details(exercise.exerciseId)?.name ?? ''}
                  onDragChange={setDragging}
                  onMove={(from, to) =>
                    setExercises((exercises) => {
                      const next = [...exercises];
                      const [moved] = next.splice(from, 1);
                      if (moved) {
                        next.splice(to, 0, moved);
                      }
                      return next;
                    })
                  }
                  renderItem={exerciseRow}
                />
              </Card>
            ) : null}
            {over > 0 ? (
              <Text variant="caption" color="danger">
                {t('editor.overLimit', { count: over, max })}
              </Text>
            ) : over === 0 ? (
              <Text variant="caption" color="textMuted">
                {t('editor.limit', { max })}
              </Text>
            ) : null}
            {over < 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/workout/pick')}
                style={[
                  styles.add,
                  {
                    gap: spacing.sm,
                    borderRadius: radii.lg,
                    borderColor: colors.planned,
                    backgroundColor: colors.selected,
                  },
                ]}
              >
                <Icon name="plus" size={20} color="primaryText" />
                <Text variant="label" color="primaryText">
                  {t('picker.title')}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {draft.id !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: remove.isPending }}
              disabled={remove.isPending}
              onPress={onDelete}
              style={[styles.delete, { opacity: remove.isPending ? 0.4 : 1 }]}
            >
              <Text variant="label" color="danger">
                {t('editor.delete')}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}

      <ExerciseSheet
        exercise={editingExercise}
        details={editingExercise ? details(editingExercise.exerciseId) : undefined}
        onChange={(changed) =>
          setExercises((exercises) =>
            exercises.map((exercise) => (exercise.key === changed.key ? changed : exercise)),
          )
        }
        onRemove={() => {
          setExercises((exercises) => exercises.filter((exercise) => exercise.key !== editing));
          setEditing(null);
        }}
        onClose={() => setEditing(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    height: 52,
    borderWidth: 1.5,
  },
  days: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  add: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
