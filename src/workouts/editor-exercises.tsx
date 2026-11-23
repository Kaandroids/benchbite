import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { DashedButton } from '@/components/ui/dashed-button';
import { Icon } from '@/components/ui/icon';
import { ReorderList } from '@/components/ui/reorder-list';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import type { LibraryExercise } from '@/exercises/library';
import { useTheme } from '@/theme';

import type { DraftExercise } from './draft';
import { useRestFormat, useTargetFormat } from './format';
import { SupersetLine } from './superset-marks';
import { supersetPlace } from './supersets';

const ROW_HEIGHT = 76;

type EditorExercisesProps = {
  exercises: DraftExercise[];
  details: (exerciseId: string) => LibraryExercise | undefined;
  /** The most exercises the workout may have, and how many it has over it. */
  max: number;
  over: number;
  onOpen: (key: string) => void;
  onMove: (from: number, to: number) => number | void;
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
  const { spacing } = useTheme();
  const formatTarget = useTargetFormat();
  const formatRest = useRestFormat();

  const row = (exercise: DraftExercise, index: number) => {
    const info = details(exercise.exerciseId);
    const superset = supersetPlace(exercises, index);
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={info?.name}
        onPress={() => onOpen(exercise.key)}
        style={[styles.exercise, { gap: spacing.md }]}
      >
        {superset ? <SupersetLine place={superset} inset={spacing.md} /> : null}
        <ExerciseThumbnail exercise={info} size={52} name={info?.name} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {info?.name ?? ''}
          </Text>
          <Text variant="captionStrong" color="primaryText">
            {formatTarget(exercise.sets, exercise.target)}
          </Text>
          {superset ? (
            <Text variant="captionStrong" color="primaryText">
              {t('workout.superset.line', { rest: formatRest(exercise.restSeconds) })}
            </Text>
          ) : (
            <Text variant="caption" color="textMuted">
              {formatRest(exercise.restSeconds)}
            </Text>
          )}
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
        <DashedButton
          icon="plus"
          label={t('picker.title')}
          tone="primary"
          onPress={() => router.push('/workout/pick')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // As tall as the row, so that a superset's line runs on from one row to the next.
  exercise: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
  },
});
