import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ReorderList } from '@/components/ui/reorder-list';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import { useTheme } from '@/theme';

import type { DraftExercise } from './draft';
import { useRestFormat, useTargetFormat } from './format';

const ROW_HEIGHT = 76;

type EditorExercisesProps = {
  exercises: DraftExercise[];
  details: (exerciseId: string) => LibraryExercise | undefined;
  /** The most exercises the workout may have, and how many it has over it. */
  max: number;
  over: number;
  onOpen: (key: string) => void;
  onMove: (from: number, to: number) => void;
  onDragChange: (dragging: boolean) => void;
};

/**
 * The workout's exercises in order, to open or drag into another place, with how many it may have
 * and a button to add more while there is room.
 */
export function EditorExercises({
  exercises,
  details,
  max,
  over,
  onOpen,
  onMove,
  onDragChange,
}: EditorExercisesProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();

  const row = (exercise: DraftExercise) => {
    const info = details(exercise.exerciseId);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={info?.name}
        onPress={() => onOpen(exercise.key)}
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
    <View style={{ gap: spacing.sm }}>
      <Text variant="captionStrong" color="textMuted">
        {t('editor.exercises', { count: exercises.length })}
      </Text>
      {exercises.length > 0 ? (
        <Card list style={{ paddingHorizontal: spacing.md }}>
          <ReorderList
            items={exercises}
            keyOf={(exercise) => exercise.key}
            rowHeight={ROW_HEIGHT}
            labelOf={(exercise) => details(exercise.exerciseId)?.name ?? ''}
            onDragChange={onDragChange}
            onMove={onMove}
            renderItem={row}
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
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
});
