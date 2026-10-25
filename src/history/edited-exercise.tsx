import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { thumbnailOf, type LibraryExercise } from '@/exercises/library';
import type { SetKind } from '@/sets/fields';
import { AddSetButton, SetHeader, SetLine, setButtonStyle } from '@/sets/set-table';
import { missingFields } from '@/sets/values';
import { fonts, useTheme } from '@/theme';

import type { EditedExercise, EditedSet } from './use-log-edit';

type EditedExerciseCardProps = {
  exercise: EditedExercise;
  info: LibraryExercise | undefined;
  kind: SetKind;
  /** Whether saving was tried, so that missing values are marked. */
  checked: boolean;
  onChangeSets: (change: (sets: EditedSet[]) => EditedSet[]) => void;
  onAddSet: () => void;
};

/** One exercise of a finished workout, its sets to correct, remove or add to. */
export function EditedExerciseCard({
  exercise,
  info,
  kind,
  checked,
  onChangeSets,
  onAddSet,
}: EditedExerciseCardProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <Card style={{ padding: spacing.md, gap: spacing.sm }}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <ExerciseThumbnail path={thumbnailOf(info)} size={40} name={info?.name} />
        <View style={styles.flex}>
          <Text variant="label">{info?.name ?? ''}</Text>
          {exercise.sets.length === 0 ? (
            <Text variant="caption" color="textMuted" style={styles.semibold}>
              {t('session.summary.skipped')}
            </Text>
          ) : null}
        </View>
      </View>
      {exercise.sets.length > 0 ? <SetHeader kind={kind} showLast={false} /> : null}
      {exercise.sets.map((set, setIndex) => (
        <SetLine
          key={set.key}
          number={setIndex + 1}
          kind={kind}
          values={set}
          muted={false}
          invalid={checked ? missingFields(set, kind) : []}
          onChange={(values) =>
            onChangeSets((current) =>
              current.map((item) => (item.key === set.key ? { ...item, ...values } : item)),
            )
          }
          button={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('history.edit.removeSet', { number: setIndex + 1 })}
              onPress={() =>
                onChangeSets((current) => current.filter((item) => item.key !== set.key))
              }
              style={[setButtonStyle, { backgroundColor: colors.background }]}
            >
              <Icon name="minus" size={16} color="textMuted" />
            </Pressable>
          }
        />
      ))}
      <AddSetButton count={exercise.sets.length} onPress={onAddSet} />
    </Card>
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
});
