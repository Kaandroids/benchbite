import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { ReorderList } from '@/components/ui/reorder-list';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { useExerciseLibrary } from '@/exercises/library';
import { useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import { fonts, typography, useTheme } from '@/theme';

import { clearDraft, startDraft, updateDraft, useDraft, type DraftExercise } from './draft';
import { ExerciseSheet } from './exercise-sheet';
import { useRestFormat, useTargetFormat, useWorkoutName } from './format';
import { useDeleteWorkout, useExerciseLimit, useSaveWorkout, useWorkouts } from './workouts';

const ROW_HEIGHT = 76;

/** Creates a workout, or edits the name, days and exercises of the one with the id. */
export function EditorScreen({ id }: { id?: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const workouts = useWorkouts();
  const library = useExerciseLibrary();
  const limit = useExerciseLimit();
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
  const workout = id === undefined ? undefined : workouts.data?.find((item) => item.id === id);
  // A workout from the plan builder is named by its type until the user gives it a name.
  const typeName = workout && workout.name === null ? workoutName(workout) : null;
  const loaded = allLoaded([workouts, library, limit]);

  // Starts the draft once the workout is loaded. Finishers become ordinary exercises.
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
            exercises: [...workout.exercises, ...(workout.finisher ? [workout.finisher] : [])].map(
              ({ exerciseId, sets, target, restSeconds }) => ({
                exerciseId,
                sets,
                target,
                restSeconds,
              }),
            ),
          }
        : { name: '', weekdays: [], exercises: [] },
    );
    // Only when the screen opens or the workout first loads, not on every change of the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, workout?.id]);

  useEffect(() => clearDraft, []);

  const details = (exerciseId: string) => library.data?.find((item) => item.id === exerciseId);
  const close = () => router.back();
  const max = limit.data ?? 0;
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
      // BB008: the limit changed since it was loaded.
      const tooMany = (error as { code?: string }).code === 'BB008';
      Alert.alert(
        t('editor.saveErrorTitle'),
        tooMany ? t('editor.limit', { max }) : t('editor.saveError'),
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
        <ExerciseThumbnail path={info?.imagePaths[0]} size={52} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {info?.name ?? ''}
          </Text>
          <Text variant="caption" color="primaryText" style={styles.bold}>
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
        <Text
          variant="bodyStrong"
          accessibilityRole="header"
          style={[styles.bold, styles.flex]}
          align="center"
        >
          {id === undefined ? t('editor.newTitle') : t('editor.editTitle')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave || save.isPending }}
          disabled={!canSave || save.isPending}
          onPress={() => void onSave()}
          style={[
            styles.save,
            {
              borderRadius: radii.full,
              backgroundColor: canSave ? colors.primaryButton : colors.track,
            },
          ]}
        >
          <Text
            variant="bodyStrong"
            color={canSave ? 'onPrimary' : 'textMuted'}
            style={styles.bold}
          >
            {t('editor.save')}
          </Text>
        </Pressable>
      </View>

      {loaded && id !== undefined && !workout && !draft ? (
        <MessageView
          icon="dumbbell"
          title={t('workout.notFound.title')}
          message={t('workout.notFound.message')}
        />
      ) : !loaded || !draft ? (
        <View style={[styles.flex, { padding: spacing.xl }]}>
          <LoadState queries={[workouts, library, limit]} />
        </View>
      ) : (
        <ScrollView
          scrollEnabled={!dragging}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" color="textMuted" style={styles.bold}>
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
            <Text variant="caption" color="textMuted" style={styles.bold}>
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
                    <Text
                      variant="bodyStrong"
                      color={on ? 'onPrimary' : 'text'}
                      style={styles.bold}
                    >
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
            <Text variant="caption" color="textMuted" style={styles.bold}>
              {t('editor.exercises', { count: draft.exercises.length })}
            </Text>
            {draft.exercises.length > 0 ? (
              <View
                style={[
                  styles.card,
                  {
                    borderRadius: radii.lg,
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                    paddingHorizontal: spacing.md,
                  },
                ]}
              >
                <ReorderList
                  items={draft.exercises}
                  keyOf={(exercise) => exercise.key}
                  rowHeight={ROW_HEIGHT}
                  handleLabel={t('editor.reorder')}
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
              </View>
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
                <Text variant="bodyStrong" color="primaryText" style={styles.bold}>
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
              <Text variant="bodyStrong" color="danger" style={styles.bold}>
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
  bold: {
    fontFamily: fonts.extraBold,
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
  save: {
    height: 40,
    paddingHorizontal: 16,
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
  card: {
    borderWidth: 1,
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
