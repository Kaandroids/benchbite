import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { useFieldStyle } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { PillButton } from '@/components/ui/pill-button';
import { ReorderList } from '@/components/ui/reorder-list';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { move } from '@/lib/move';
import { useTheme } from '@/theme';

import {
  useAddAlternative,
  useAlternativeError,
  useAlternativeName,
  useDeleteAlternative,
  useRenameAlternative,
  useReorderAlternatives,
  useWorkoutAlternatives,
  type AlternativeChoice,
  type NewAlternative,
  type WorkoutAlternative,
} from './alternatives';
import { useWorkoutLimits, type Workout } from './workouts';

const ROW_HEIGHT = 64;
const MENU_ITEM_HEIGHT = 44;
const MENU_WIDTH = 180;

/** Before any is added, the workout's own exercises as the first alternative, in use. */
const OWN: WorkoutAlternative = {
  id: 0,
  position: 1,
  name: null,
  inUse: true,
  exerciseCount: null,
};

/**
 * An alternative to name: one in the list, or one just added, which `use` puts in use once named,
 * as Add does.
 */
type Naming = Pick<WorkoutAlternative, 'id' | 'name' | 'position'> & { use?: boolean };

type Shown = { kind: 'manage' } | { kind: 'name'; alternative: Naming } | null;

type AlternativesSheetsProps = {
  workout: Workout;
  /** Whether the workout is running, which keeps a new alternative out of use. */
  running: boolean;
  /** The screen's choice of the one in use, which the chips share. */
  choice: AlternativeChoice;
  onClose: () => void;
};

/**
 * The sheets for a workout's alternatives: the list to choose the one in use and manage them, and
 * one to name an alternative. Naming one goes back to the list, except for one just added, which
 * is put in use and closes the sheets, so that the workout shows it to fill in. Rendered while
 * open; `onClose` closes them.
 */
export function AlternativesSheets({ workout, running, choice, onClose }: AlternativesSheetsProps) {
  const [shown, setShown] = useState<Shown>({ kind: 'manage' });
  // One sheet closes before the next opens, as iOS shows one at a time.
  const show = (next: Shown) => {
    setShown(null);
    afterSheetCloses(() => setShown(next));
  };

  const named = (alternative: Naming) => {
    if (!alternative.use || running) {
      show({ kind: 'manage' });
      return;
    }
    setShown(null);
    choice.choose(alternative.id, {
      onSuccess: onClose,
      // Back on the list, which says why.
      onError: () => afterSheetCloses(() => setShown({ kind: 'manage' })),
    });
  };

  if (shown?.kind === 'name') {
    return (
      <NameAlternativeSheet
        workoutId={workout.id}
        alternative={shown.alternative}
        onClose={() => named(shown.alternative)}
      />
    );
  }
  if (shown?.kind === 'manage') {
    return (
      <ManageAlternativesSheet
        workout={workout}
        choice={choice}
        onClose={onClose}
        onName={(alternative) => show({ kind: 'name', alternative })}
      />
    );
  }
  return null;
}

type ManageProps = {
  workout: Workout;
  choice: AlternativeChoice;
  onClose: () => void;
  onName: (alternative: Naming) => void;
};

/** The ⋯ menu open on an alternative, at its place in the list. */
type Menu = { alternative: WorkoutAlternative; index: number };

/**
 * The workout's alternatives in order. Tapping one puts it in use; each has a menu to rename,
 * duplicate or delete it unless in use, and they can be dragged into another order. While there is
 * room, a row at the end adds an empty one.
 */
function ManageAlternativesSheet({ workout, choice, onClose, onName }: ManageProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const alternatives = useWorkoutAlternatives(workout.id);
  const limits = useWorkoutLimits();
  const add = useAddAlternative(workout.id);
  const remove = useDeleteAlternative(workout.id);
  const reorder = useReorderAlternatives(workout.id);
  const nameOf = useAlternativeName();
  const errorOf = useAlternativeError();
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  // Where the list starts in the sheet, to place a menu by its row.
  const [listTop, setListTop] = useState(0);

  const loaded = alternatives.data !== undefined;
  const rows = alternatives.data ?? [];
  const max = limits.data?.alternatives;
  // A workout without alternatives is one set of exercises: the first, in use.
  const count = Math.max(rows.length, 1);
  const full = max !== undefined && count >= max;
  const failed =
    (action: Parameters<typeof errorOf>[1]) =>
    (failure: unknown): void =>
      setError(errorOf(failure, action));
  /** As another change starts, the message of the last one goes, a failed switch's too. */
  const clearErrors = () => {
    setError(null);
    choice.clearError();
  };

  const isChosen = (alternative: WorkoutAlternative) =>
    rows.length === 0 || alternative.id === choice.chosenId;

  const sizeOf = (alternative: WorkoutAlternative) => {
    const exercises = alternative.inUse
      ? workout.exercises.length
      : (alternative.exerciseCount ?? 0);
    return exercises === 0
      ? t('workout.noExercises')
      : t('workout.alternatives.exercises', { count: exercises });
  };

  const onUse = (alternative: WorkoutAlternative) => {
    if (isChosen(alternative)) return;
    setError(null);
    choice.choose(alternative.id);
  };

  /** Adds an alternative, then asks for its name; one that starts empty is then put in use. */
  const onAdd = (from: NewAlternative) => {
    clearErrors();
    add.mutate(from, {
      // The new one is last, after the workout's own when it is the first added.
      onSuccess: (id) => onName({ id, name: null, position: count + 1, use: 'empty' in from }),
      onError: failed('empty' in from ? 'add' : 'duplicate'),
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
          text: t('workout.alternatives.delete'),
          style: 'destructive',
          onPress: () => {
            clearErrors();
            remove.mutate(alternative.id, { onError: failed('delete') });
          },
        },
      ],
    );
  };

  const onMove = (from: number, to: number) => {
    clearErrors();
    reorder.mutate(
      move(rows, from, to).map((alternative) => alternative.id),
      { onError: failed('reorder') },
    );
  };

  const row = (alternative: WorkoutAlternative, index: number) => {
    const name = nameOf(alternative);
    const chosen = isChosen(alternative);
    return (
      <View style={[styles.row, { height: ROW_HEIGHT, gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={name}
          accessibilityHint={sizeOf(alternative)}
          accessibilityState={{ checked: chosen }}
          onPress={() => onUse(alternative)}
          style={({ pressed }) => [
            styles.row,
            styles.text,
            { height: ROW_HEIGHT, gap: spacing.md, opacity: pressed && !chosen ? 0.6 : 1 },
          ]}
        >
          <Radio checked={chosen} />
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" color="textMuted">
              {sizeOf(alternative)}
            </Text>
          </View>
        </Pressable>
        <RoundIconButton
          icon="more"
          color="textMuted"
          background={
            menu?.alternative.id === alternative.id ? 'track' : chosen ? 'selected' : 'surface'
          }
          size={40}
          label={t('workout.alternatives.more', { name })}
          onPress={() => setMenu({ alternative, index })}
        />
      </View>
    );
  };

  // The rows are tinted when chosen, across the whole width of the list.
  const tint = (alternative: WorkoutAlternative) => ({
    paddingHorizontal: spacing.md,
    backgroundColor: isChosen(alternative) ? colors.selected : colors.surface,
  });

  /** The menu's actions: the workout's own before any is added can only be duplicated. */
  const actions = (alternative: WorkoutAlternative): MenuAction[] => {
    const own = rows.length === 0;
    return [
      ...(own
        ? []
        : [
            {
              key: 'rename',
              icon: 'edit' as const,
              label: t('workout.alternatives.rename'),
              onPress: () => onName(alternative),
            },
          ]),
      {
        key: 'duplicate',
        icon: 'copy',
        label: t('workout.alternatives.duplicate'),
        disabled: full,
        onPress: () => onAdd({ copyOf: own ? null : alternative.id }),
      },
      // The one in use is the workout, which another must replace before it can go.
      ...(own || alternative.inUse
        ? []
        : [
            {
              key: 'delete',
              icon: 'trash' as const,
              label: t('workout.alternatives.delete'),
              danger: true,
              onPress: () => onDelete(alternative),
            },
          ]),
    ];
  };

  return (
    <Sheet onClose={onClose}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="headline" accessibilityRole="header">
          {t('workout.alternatives.title')}
        </Text>
        <Text color="textMuted">
          {rows.length >= 2 ? t('workout.alternatives.body') : t('workout.alternatives.bodyEmpty')}
        </Text>
      </View>
      {loaded && rows.length === 0 ? <Example /> : null}
      <View onLayout={(event) => setListTop(event.nativeEvent.layout.y)}>
        <Card list style={[styles.list, { paddingHorizontal: 0 }]}>
          {!loaded ? (
            // Not the single row, which would read as a workout without alternatives.
            <View
              style={[
                styles.row,
                styles.single,
                { height: ROW_HEIGHT, gap: spacing.sm, paddingHorizontal: spacing.md },
              ]}
            >
              {alternatives.isError ? (
                <>
                  <Text
                    variant="caption"
                    color="danger"
                    accessibilityRole="alert"
                    style={styles.text}
                  >
                    {t('workout.alternatives.loadError')}
                  </Text>
                  <PillButton
                    label={t('common.tryAgain')}
                    onPress={() => void alternatives.refetch()}
                  />
                </>
              ) : (
                <ActivityIndicator
                  color={colors.primary}
                  accessibilityLabel={t('common.loading')}
                  style={styles.text}
                />
              )}
            </View>
          ) : rows.length > 0 ? (
            // Gestures in a modal need a root of their own on Android; sized by the list, not flex.
            <GestureHandlerRootView style={styles.gestureRoot}>
              <ReorderList
                items={rows}
                keyOf={(alternative) => String(alternative.id)}
                rowHeight={ROW_HEIGHT}
                labelOf={nameOf}
                onMove={onMove}
                onDragChange={() => setMenu(null)}
                rowStyle={tint}
                renderItem={row}
              />
            </GestureHandlerRootView>
          ) : (
            <View style={tint(OWN)}>{row(OWN, 0)}</View>
          )}
          {loaded && !full ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('workout.alternatives.add')}
              accessibilityHint={t('workout.alternatives.addNote')}
              accessibilityState={{ disabled: add.isPending }}
              disabled={add.isPending}
              onPress={() => onAdd({ empty: true })}
              style={({ pressed }) => [
                styles.row,
                listDivider(false, colors.border),
                {
                  height: ROW_HEIGHT,
                  gap: spacing.md,
                  paddingHorizontal: spacing.md,
                  opacity: pressed ? 0.6 : 1,
                },
              ]}
            >
              <View style={[styles.addIcon, { borderRadius: radii.full }]}>
                {add.isPending ? (
                  <ActivityIndicator color={colors.textMuted} />
                ) : (
                  <Icon name="plus" size={20} color="textMuted" />
                )}
              </View>
              <View style={styles.text}>
                <Text variant="bodyStrong">{t('workout.alternatives.add')}</Text>
                <Text variant="caption" color="textMuted">
                  {t('workout.alternatives.addNote')}
                </Text>
              </View>
            </Pressable>
          ) : null}
        </Card>
      </View>
      {loaded && full ? (
        <Text variant="caption" color="textMuted" align="center">
          {t('workout.alternatives.full', { max })}
        </Text>
      ) : null}
      {error || choice.error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error ?? choice.error}
        </Text>
      ) : null}
      {menu ? (
        <AlternativeMenu
          actions={actions(menu.alternative)}
          // Under the first row, and over the others, so that it stays on the sheet.
          top={
            menu.index === 0
              ? listTop + ROW_HEIGHT - spacing.sm
              : listTop +
                menu.index * ROW_HEIGHT +
                spacing.sm -
                menuHeight(actions(menu.alternative))
          }
          right={spacing.xl + spacing.sm}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </Sheet>
  );
}

/** The mark of the one in use: a ring, filled when checked. */
function Radio({ checked }: { checked: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.radio, { borderColor: checked ? colors.primary : colors.border }]}>
      {checked ? <View style={[styles.radioDot, { backgroundColor: colors.primary }]} /> : null}
    </View>
  );
}

/** What alternatives are for, before a workout has any: a gym and a home version side by side. */
function Example() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const tile = (name: string, exercises: string) => (
    <View
      style={[
        styles.text,
        {
          gap: 2,
          padding: spacing.md,
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Text variant="captionStrong">{name}</Text>
      <Text variant="caption" color="textMuted" numberOfLines={1}>
        {exercises}
      </Text>
    </View>
  );
  return (
    // Says nothing the line above does not, so screen readers skip it.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.row, { gap: spacing.sm }]}
    >
      {tile(t('workout.alternatives.example.gym'), t('workout.alternatives.example.gymExercises'))}
      {tile(
        t('workout.alternatives.example.home'),
        t('workout.alternatives.example.homeExercises'),
      )}
    </View>
  );
}

type MenuAction = {
  key: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
};

function menuHeight(actions: MenuAction[]) {
  return actions.length * MENU_ITEM_HEIGHT + 2 * 6;
}

/**
 * A small menu over the sheet at `top` and `right`, which closes on a tap anywhere else in the
 * sheet or on an action, before the action runs.
 */
function AlternativeMenu({
  actions,
  top,
  right,
  onClose,
}: {
  actions: MenuAction[];
  top: number;
  right: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        onPress={onClose}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityRole="menu"
        style={[
          styles.menu,
          {
            top,
            right,
            width: MENU_WIDTH,
            paddingVertical: 6,
            borderRadius: radii.md,
            borderColor: colors.border,
            backgroundColor: colors.elevated,
          },
        ]}
      >
        {actions.map((action) => (
          <Pressable
            key={action.key}
            accessibilityRole="menuitem"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: action.disabled ?? false }}
            disabled={action.disabled}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            style={({ pressed }) => [
              styles.row,
              {
                height: MENU_ITEM_HEIGHT,
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                opacity: action.disabled ? 0.4 : pressed ? 0.6 : 1,
              },
            ]}
          >
            <Icon name={action.icon} size={18} color={action.danger ? 'danger' : 'text'} />
            <Text variant="body" color={action.danger ? 'danger' : 'text'}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </>
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
  list: {
    overflow: 'hidden',
  },
  gestureRoot: {
    alignSelf: 'stretch',
  },
  single: {
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  addIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    borderWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  field: {
    justifyContent: 'center',
  },
  counter: {
    position: 'absolute',
  },
});
