import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { whenSheetClosed } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import type { LibraryExercise } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { minutesAndSeconds } from '@/lib/time';
import { lastSetsQuery } from '@/sessions/logs';
import type { LastSets } from '@/sessions/session';
import { setKindOf, weightStepOf } from '@/sets/fields';
import { useTheme } from '@/theme';

import type { DraftExercise } from './draft';
import { SetTargetSheet } from './set-target-sheet';
import { firstTargets, targetAt, withTarget, type SetTarget } from './set-targets';

type SetTargetsSectionProps = {
  exercise: DraftExercise;
  details: LibraryExercise | undefined;
  /** Changes the targets from the exercise as it is then, which may change while they load. */
  onChange: (change: (exercise: DraftExercise) => SetTarget[] | null) => void;
};

/**
 * The user's own targets for each set of an exercise (ADR 0138): one row to add them, or a row
 * per set that opens its target, and a button to clear them. None for a distance, which has no
 * targets.
 */
export function SetTargetsSection({ exercise, details, onChange }: SetTargetsSectionProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<number | null>(null);
  const kind = setKindOf(details?.metrics, exercise.target);
  if (kind.fields.includes('meters')) {
    return null;
  }
  const weighted = !kind.timed;
  const targets = exercise.setTargets;

  const describe = (target: SetTarget) => {
    if (target.seconds !== null) {
      return minutesAndSeconds(target.seconds);
    }
    const reps = target.reps ?? 0;
    return target.weightKg === null
      ? t('editor.targetReps', { count: reps })
      : `${format(target.weightKg)} kg × ${reps}`;
  };

  const add = async () => {
    const last = await queryClient
      .fetchQuery(lastSetsQuery([exercise.exerciseId]))
      .catch((error: unknown): LastSets => {
        console.warn('Could not load the last sets', error);
        return {};
      });
    onChange((current) =>
      firstTargets(current.sets, current.target, last[current.exerciseId], weighted),
    );
  };

  if (!targets) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t(kind.timed ? 'editor.addTargetsTimedNote' : 'editor.addTargetsNote')}
        onPress={() => void add()}
      >
        <Card style={[styles.row, { gap: spacing.md }]}>
          <View style={styles.flex}>
            <Text variant="bodyStrong">{t('editor.addTargets')}</Text>
            <Text variant="caption" color="textMuted">
              {t(kind.timed ? 'editor.addTargetsTimedNote' : 'editor.addTargetsNote')}
            </Text>
          </View>
          <Icon name="forward" color="textMuted" />
        </Card>
      </Pressable>
    );
  }

  const editingTarget = editing === null ? undefined : targetAt(targets, editing);
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="caption" color="textMuted" accessibilityRole="header">
        {t('editor.targets')}
      </Text>
      <Card list>
        {Array.from({ length: exercise.sets }, (_, index) => {
          const target = targetAt(targets, index) as SetTarget;
          const label = t('editor.setNumber', { number: index + 1 });
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${describe(target)}`}
              // iOS shows no sheet while the one before is still closing.
              onPress={() => void whenSheetClosed().then(() => setEditing(index))}
              style={[
                styles.row,
                {
                  gap: spacing.md,
                  minHeight: 52,
                  ...listDivider(index === 0, colors.border),
                },
              ]}
            >
              <Text variant="bodyStrong" style={styles.flex}>
                {label}
              </Text>
              <Text variant="bodyStrong">{describe(target)}</Text>
              <Icon name="forward" color="textMuted" />
            </Pressable>
          );
        })}
      </Card>
      {/* Grey, as a way back rather than an action of its own. */}
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(() => null)}
        style={[styles.clear, { minHeight: 44 }]}
      >
        <Text variant="bodyStrong" color="textMuted">
          {t('editor.clearTargets')}
        </Text>
      </Pressable>
      {editing !== null && editingTarget ? (
        <SetTargetSheet
          index={editing}
          target={editingTarget}
          weight={weighted ? { step: weightStepOf(details?.equipment) } : null}
          onDone={(changed) =>
            onChange((current) => withTarget(current.setTargets, current.sets, editing, changed))
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  clear: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
