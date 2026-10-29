import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import type { BeatenRecord } from '@/history/record-history';
import { addsWeight } from '@/sets/fields';
import { useRecordFormat, useRecordGainFormat, useRecordKindLabel } from '@/sets/records';
import { useTheme } from '@/theme';

type RecordRowProps = {
  record: BeatenRecord;
  /** Undefined for an exercise no longer in the library. */
  exercise: LibraryExercise | undefined;
  /** The record's day, written out. */
  day: string;
  divider: boolean;
};

/** An exercise's name, or a word for one no longer in the library. */
export function useExerciseName() {
  const { t } = useTranslation();
  return (exercise: LibraryExercise | undefined) => exercise?.name ?? t('progress.records.unknown');
}

/**
 * A record beaten: the exercise's picture and name, the record's kind and day, its value and gain.
 * Opens the exercise.
 */
export function RecordRow({ record, exercise, day, divider }: RecordRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const formatRecord = useRecordFormat();
  const formatGain = useRecordGainFormat();
  const kindLabel = useRecordKindLabel();
  const exerciseName = useExerciseName();
  const kind = kindLabel(record.kind, exercise !== undefined && addsWeight(exercise.metrics));
  const name = exerciseName(exercise);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('progress.records.open')}
      onPress={() =>
        router.push({ pathname: '/progress/exercise-history', params: { id: record.exerciseId } })
      }
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          borderTopWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderTopColor: colors.border,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <ExerciseThumbnail path={thumbnailOf(exercise)} size={44} name={name} />
      <View style={styles.flex}>
        <Text variant="label" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {`${kind} · ${day}`}
        </Text>
      </View>
      <View style={styles.value}>
        <Text variant="label" style={styles.tabular}>
          {formatRecord(record)}
        </Text>
        <Text variant="captionStrong" color="success" style={styles.tabular}>
          {formatGain(record)}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  flex: {
    flex: 1,
  },
  value: {
    alignItems: 'flex-end',
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
});
