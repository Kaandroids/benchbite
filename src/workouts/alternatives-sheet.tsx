import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { ReorderList } from '@/components/ui/reorder-list';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import {
  useAddAlternative,
  useAlternativeError,
  useAlternativeName,
  useDeleteAlternative,
  useRenameAlternative,
  useReorderAlternatives,
  useWorkoutAlternatives,
  type WorkoutAlternative,
} from './alternatives';
import { useWorkoutLimits, type Workout } from './workouts';

const ROW_HEIGHT = 60;

/** An alternative to name: one in the list, or one just added. */
type Naming = Pick<WorkoutAlternative, 'id' | 'name' | 'position'>;

type Shown = { kind: 'manage' } | { kind: 'name'; alternative: Naming } | null;

/**
 * The sheets for a workout's alternatives: the list to manage them, and one to name an
 * alternative, which goes back to the list once done. Rendered while open; `onClose` closes them.
 */
export function AlternativesSheets({
  workout,
  onClose,
}: {
  workout: Workout;
  onClose: () => void;
}) {
  const [shown, setShown] = useState<Shown>({ kind: 'manage' });
  // One sheet closes before the next opens, as iOS shows one at a time.
  const show = (next: Shown) => {
    setShown(null);
    afterSheetCloses(() => setShown(next));
  };
  if (shown?.kind === 'name') {
    return (
      <NameAlternativeSheet
        workoutId={workout.id}
        alternative={shown.alternative}
        onClose={() => show({ kind: 'manage' })}
      />
    );
  }
  if (shown?.kind === 'manage') {
    return (
      <ManageAlternativesSheet
        workout={workout}
        onClose={onClose}
        onName={(alternative) => show({ kind: 'name', alternative })}
      />
    );
  }
  return null;
}

type ManageProps = {
  workout: Workout;
  onClose: () => void;
  onName: (alternative: Naming) => void;
};

/**
 * The workout's alternatives in order, each to rename, delete unless in use, or drag into another
 * place, and a button to add a copy of the one in use while there is room.
 */
function ManageAlternativesSheet({ workout, onClose, onName }: ManageProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const alternatives = useWorkoutAlternatives(workout.id);
  const limits = useWorkoutLimits();
  const add = useAddAlternative(workout.id);
  const remove = useDeleteAlternative(workout.id);
  const reorder = useReorderAlternatives(workout.id);
  const nameOf = useAlternativeName();
  const errorOf = useAlternativeError();
  const [error, setError] = useState<string | null>(null);

  const rows = alternatives.data ?? [];
  const max = limits.data?.alternatives;
  // A workout without alternatives is one set of exercises: the first, in use.
  const count = Math.max(rows.length, 1);
  const full = max !== undefined && count >= max;
  const failed =
    (action: Parameters<typeof errorOf>[1]) =>
    (failure: unknown): void =>
      setError(errorOf(failure, action));

  const exercisesOf = (alternative: Pick<WorkoutAlternative, 'inUse' | 'exerciseCount'>) =>
    alternative.inUse
      ? t('workout.alternatives.inUse', { count: workout.exercises.length })
      : t('workout.alternatives.exercises', { count: alternative.exerciseCount ?? 0 });

  const onAdd = () => {
    setError(null);
    add.mutate(undefined, {
      // The new one is last, after the workout's own when it is the first added.
      onSuccess: (id) => onName({ id, name: null, position: count + 1 }),
      onError: failed('add'),
    });
  };

  const onDelete = (alternative: WorkoutAlternative) => {
    const name = nameOf(alternative);
    Alert.alert(
      t('workout.alternatives.deleteTitle', { name }),
      t('workout.alternatives.deleteMessage'),
      [
        { text: t('workout.alternatives.cancel'), style: 'cancel' },
        {
          text: t('workout.alternatives.deleteConfirm'),
          style: 'destructive',
          onPress: () => {
            setError(null);
            remove.mutate(alternative.id, { onError: failed('delete') });
          },
        },
      ],
    );
  };

  const onMove = (from: number, to: number) => {
    const ids = rows.map((alternative) => alternative.id);
    const [moved] = ids.splice(from, 1);
    if (moved === undefined) return;
    ids.splice(to, 0, moved);
    setError(null);
    reorder.mutate(ids, { onError: failed('reorder') });
  };

  const row = (alternative: WorkoutAlternative) => {
    const name = nameOf(alternative);
    return (
      <View style={[styles.row, { gap: spacing.xs }]}>
        <View style={styles.text}>
          <View style={[styles.row, { gap: spacing.xs }]}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            {alternative.inUse ? <Icon name="check" size={16} color="primaryText" /> : null}
          </View>
          <Text variant="caption" color="textMuted">
            {exercisesOf(alternative)}
          </Text>
        </View>
        <RoundIconButton
          icon="edit"
          color="textMuted"
          background="surface"
          size={44}
          label={t('workout.alternatives.rename', { name })}
          onPress={() => onName(alternative)}
        />
        {/* The one in use is the workout, which another must replace before it can go. */}
        <RoundIconButton
          icon="trash"
          color="danger"
          background="surface"
          size={44}
          disabled={alternative.inUse}
          label={t('workout.alternatives.delete', { name })}
          onPress={() => onDelete(alternative)}
        />
      </View>
    );
  };

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          {t('workout.alternatives.title')}
        </Text>
        <Text color="textMuted">{t('workout.alternatives.body')}</Text>
      </View>
      <Card list style={{ paddingHorizontal: spacing.md }}>
        {rows.length > 1 ? (
          // Gestures in a modal need a root of their own on Android; sized by the list, not flex.
          <GestureHandlerRootView style={styles.gestureRoot}>
            <ReorderList
              items={rows}
              keyOf={(alternative) => String(alternative.id)}
              rowHeight={ROW_HEIGHT}
              labelOf={nameOf}
              onMove={onMove}
              renderItem={row}
            />
          </GestureHandlerRootView>
        ) : (
          // Before any is added, the workout's own exercises, which cannot be renamed or deleted.
          <View style={[styles.single, { height: ROW_HEIGHT }]}>
            <View style={[styles.row, { gap: spacing.xs }]}>
              <Text variant="bodyStrong">{nameOf({ name: null, position: 1 })}</Text>
              <Icon name="check" size={16} color="primaryText" />
            </View>
            <Text variant="caption" color="textMuted">
              {exercisesOf({ inUse: true, exerciseCount: null })}
            </Text>
          </View>
        )}
      </Card>
      {error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Button
          label={t('workout.alternatives.add')}
          variant="secondary"
          disabled={full || alternatives.data === undefined}
          loading={add.isPending}
          onPress={onAdd}
        />
        <Text variant="caption" color="textMuted" align="center">
          {full ? t('workout.alternatives.full', { max }) : t('workout.alternatives.addNote')}
        </Text>
      </View>
    </Sheet>
  );
}

type NameProps = {
  workoutId: number;
  alternative: Naming;
  onClose: () => void;
};

/** A short name for an alternative, with how many letters are left; empty leaves it unnamed. */
function NameAlternativeSheet({ workoutId, alternative, onClose }: NameProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const field = useFieldStyle();
  const limits = useWorkoutLimits();
  const rename = useRenameAlternative(workoutId);
  const errorOf = useAlternativeError();
  const nameOf = useAlternativeName();
  const [text, setText] = useState(alternative.name ?? '');
  const maxLength = limits.data?.alternative_name_length;
  const fallback = nameOf({ name: null, position: alternative.position });

  const save = () => {
    if (rename.isPending) return;
    if (text.trim() === (alternative.name ?? '')) {
      onClose();
      return;
    }
    rename.mutate({ id: alternative.id, name: text }, { onSuccess: onClose });
  };

  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {t('workout.alternatives.nameTitle')}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <Text variant="captionStrong" color="textMuted">
          {t('workout.alternatives.nameLabel')}
        </Text>
        <View style={styles.field}>
          <TextInput
            accessibilityLabel={t('workout.alternatives.nameTitle')}
            value={text}
            onChangeText={setText}
            onSubmitEditing={save}
            editable={!rename.isPending}
            maxLength={maxLength}
            returnKeyType="done"
            autoFocus
            placeholder={fallback}
            placeholderTextColor={colors.placeholder}
            style={[field, { paddingRight: spacing.xxl + spacing.xl }]}
          />
          {maxLength !== undefined ? (
            <Text
              variant="captionStrong"
              color="textMuted"
              accessibilityLabel={t('workout.alternatives.counterLabel', {
                length: text.length,
                max: maxLength,
              })}
              style={[styles.counter, { right: spacing.md }]}
            >
              {t('workout.alternatives.counter', { length: text.length, max: maxLength })}
            </Text>
          ) : null}
        </View>
        <Text variant="caption" color="textMuted">
          {t('workout.alternatives.emptyName', { fallback })}
        </Text>
      </View>
      {rename.isError ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {errorOf(rename.error, 'rename')}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Button
          label={t('workout.alternatives.cancel')}
          variant="secondary"
          onPress={onClose}
          style={styles.flex}
        />
        <Button
          label={t('workout.alternatives.save')}
          loading={rename.isPending}
          onPress={save}
          style={styles.flex}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  gestureRoot: {
    alignSelf: 'stretch',
  },
  single: {
    justifyContent: 'center',
  },
  field: {
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
  },
});
