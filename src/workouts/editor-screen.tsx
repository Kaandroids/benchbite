import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LoadState } from '@/components/load-state';
import { Icon } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { PillButton } from '@/components/ui/pill-button';
import { Text } from '@/components/ui/text';
import { findExercise } from '@/exercises/library';
import { typography, useTheme } from '@/theme';

import { updateDraft } from './draft';
import { EditorExercises } from './editor-exercises';
import { ExerciseSheet } from './exercise-sheet';
import { useWorkoutEditor } from './use-workout-editor';
import { WeekdayPicker } from './weekday-picker';

/** Creates a workout, or edits the name, days and exercises of the one with the id. */
export function EditorScreen({ id }: { id?: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const editor = useWorkoutEditor(id);
  const { draft, workout, typeName, library, loaded, max, over, setExercises } = editor;
  const [editing, setEditing] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const details = (exerciseId: string) => findExercise(library.data, exerciseId);
  const editingExercise = draft?.exercises.find((exercise) => exercise.key === editing) ?? null;

  return (
    <SafeAreaView
      style={[styles.flex, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
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
          disabled={!editor.canSave || editor.saving}
          onPress={() => void editor.onSave()}
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
          <LoadState queries={editor.queries} />
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
            <WeekdayPicker
              value={draft.weekdays}
              onChange={(weekdays) => updateDraft((current) => ({ ...current, weekdays }))}
            />
            <Text variant="caption" color="textMuted">
              {t('editor.daysHint')}
            </Text>
          </View>

          <EditorExercises
            exercises={draft.exercises}
            details={details}
            max={max}
            over={over}
            onOpen={setEditing}
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
          />

          {draft.id !== undefined ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: editor.deleting }}
              disabled={editor.deleting}
              onPress={editor.onDelete}
              style={[styles.delete, { opacity: editor.deleting ? 0.4 : 1 }]}
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
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
