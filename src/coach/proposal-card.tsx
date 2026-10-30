import type { DayTargets, ProposalCard as Proposal } from '@shared/coach/chat';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useNumberFormat } from '@/i18n/units';
import { radii, spacing, useTheme, type ColorTokens } from '@/theme';
import { useTargetFormat, useWorkoutName } from '@/workouts/format';
import type { Workout, WorkoutTarget } from '@/workouts/workouts';

import {
  type ProposalDecision,
  type ProposalFailure,
  type ProposalState,
  type ProposalStatus,
  proposalFailure,
  useDecideProposal,
} from './proposals';

type ProposalCardProps = {
  card: Proposal;
  /** Where it stands; unknown while it loads, or for one Bite just proposed. */
  state?: ProposalState;
  /** Waits for where it stands before it may be decided. */
  waiting?: boolean;
};

/**
 * A change Bite proposed, under its answer (boards 4 and 11, ADR 0058): what changes, from today,
 * to apply or keep as it is. Once decided it folds into a line that says so, and an applied one
 * offers Undo (board 5).
 */
export function ProposalCard({ card, state, waiting = false }: ProposalCardProps) {
  const { t } = useTranslation();
  const decide = useDecideProposal(card);
  const summary = useSummary();
  // What the user decided here wins over where it stood when loaded: states loading again, as for
  // a new proposal, may still hold it as it was before.
  const [decided, setDecided] = useState<ProposalStatus>();
  const status = decided ?? state?.status ?? 'pending';
  // A refusal says why on the card while the proposal stands where it was refused: an undo is
  // refused applied, the rest pending.
  const refused =
    decide.isError && (decide.variables === 'undo') === (status === 'applied')
      ? proposalFailure(decide.error)
      : undefined;
  const choose = (decision: ProposalDecision) => decide.mutate(decision, { onSuccess: setDecided });

  if (status === 'applied') {
    return (
      <View>
        <DecidedLine
          icon="check"
          iconColor="success"
          text={t('bite.proposal.applied', { summary: summary(card) })}
          action={
            // Undo stands as long as nothing changed what applying left.
            refused === 'changed' || refused === 'outOfDate' ? undefined : (
              <TextLink
                label={t('bite.proposal.undo')}
                size="regular"
                disabled={decide.isPending}
                onPress={() => choose('undo')}
              />
            )
          }
        />
        {refused ? <Refusal failure={refused} /> : null}
      </View>
    );
  }
  if (status === 'undone' || status === 'kept') {
    return (
      <DecidedLine
        icon={status === 'undone' ? 'undo' : 'close'}
        iconColor="textMuted"
        text={t(status === 'undone' ? 'bite.proposal.undone' : 'bite.proposal.kept')}
      />
    );
  }

  // A refusal says why on the card. What can no longer be applied may still be put away, as kept,
  // unless it is out of date; a request that failed may be tried again.
  const line = state?.expired ? 'outOfDate' : refused;
  const canApply = line === undefined || line === 'failed';
  const canKeep = line !== 'outOfDate';
  return (
    <Card>
      {card.kind === 'workout' ? <WorkoutChange card={card} /> : <TargetsChange card={card} />}
      {line ? <Refusal failure={line} /> : null}
      {canKeep ? (
        <View style={styles.buttons}>
          {canApply ? (
            <Button
              label={t('bite.proposal.apply')}
              size="small"
              style={styles.flex}
              // One decision at a time: Keep as is, sent, leaves nothing to apply.
              disabled={waiting || (decide.isPending && decide.variables !== 'apply')}
              loading={decide.isPending && decide.variables === 'apply'}
              onPress={() => choose('apply')}
            />
          ) : null}
          <TextLink
            label={t('bite.proposal.keep')}
            tone="muted"
            size="regular"
            align={canApply ? 'center' : 'start'}
            disabled={waiting || decide.isPending}
            onPress={() => choose('keep')}
          />
        </View>
      ) : null}
    </Card>
  );
}

/** The card's title, and when the change counts from. */
function Header({ title }: { title: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.header, { gap: spacing.sm }]}>
      <Text variant="label" accessibilityRole="header" style={styles.flex}>
        {title}
      </Text>
      <Text variant="captionStrong" color="textMuted">
        {t('bite.proposal.fromToday')}
      </Text>
    </View>
  );
}

/** A target as the workouts format it. */
function workoutTarget(target: Extract<Proposal, { kind: 'workout' }>['swaps'][number]['target']) {
  return target.reps
    ? ({ reps: target.reps } satisfies WorkoutTarget)
    : ({ seconds: target.seconds ?? null, meters: target.meters ?? null } satisfies WorkoutTarget);
}

/** The exercises swapped: the old one struck through, the new one, its sets and why. */
function WorkoutChange({ card }: { card: Extract<Proposal, { kind: 'workout' }> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const workoutName = useWorkoutName();
  const targetFormat = useTargetFormat();
  return (
    <>
      <Header
        title={workoutName({ name: card.workout.name, type: card.workout.type as Workout['type'] })}
      />
      <View>
        {card.swaps.map((swap, index) => {
          const detail = [targetFormat(swap.sets, workoutTarget(swap.target)), swap.why]
            .filter(Boolean)
            .join(' · ');
          return (
            <View
              key={index}
              accessible
              accessibilityLabel={t('bite.proposal.swapLabel', {
                from: swap.from,
                to: swap.to,
                detail,
              })}
              style={[styles.row, listDivider(index === 0, colors.border)]}
            >
              <Change from={swap.from} to={<Text variant="bodyStrong">{swap.to}</Text>} />
              <Text variant="caption" color="textMuted">
                {detail}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

const MACROS = [
  { key: 'calories', name: 'nutrition.calorieLabel', color: 'text', unit: 'kcal' },
  { key: 'proteinG', name: 'nutrition.macros.protein', color: 'protein', unit: 'grams' },
  { key: 'carbsG', name: 'nutrition.macros.carbs', color: 'carbs', unit: 'grams' },
  { key: 'fatG', name: 'nutrition.macros.fat', color: 'fat', unit: 'grams' },
] as const satisfies {
  key: keyof DayTargets;
  name: string;
  color: keyof ColorTokens;
  unit: 'kcal' | 'grams';
}[];

/** The targets that change: each one in use struck through, and the new one. */
function TargetsChange({ card }: { card: Extract<Proposal, { kind: 'targets' }> }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const changed = MACROS.filter(({ key }) => card.from?.[key] !== card.to[key]);
  const value = (unit: 'kcal' | 'grams', amount: number) =>
    unit === 'kcal'
      ? t('nutrition.kcal', { calories: format(amount) })
      : t('nutrition.grams', { count: amount });
  return (
    <>
      <Header title={t('bite.proposal.targetsTitle')} />
      <View>
        {changed.map(({ key, name: nameKey, color, unit }, index) => {
          const from = card.from?.[key];
          const name = t(nameKey);
          const to = value(unit, card.to[key]);
          const was = from === null || from === undefined ? undefined : value(unit, from);
          return (
            <View
              key={key}
              accessible
              accessibilityLabel={
                was
                  ? t('bite.proposal.targetLabel', { name, from: was, to })
                  : t('bite.proposal.newTargetLabel', { name, to })
              }
              style={[
                styles.row,
                styles.target,
                listDivider(index === 0, colors.border),
                { gap: spacing.sm },
              ]}
            >
              <Text variant="bodyStrong" style={styles.flex}>
                {name}
              </Text>
              <Change
                from={was}
                to={
                  <Text variant="label" color={color}>
                    {to}
                  </Text>
                }
              />
            </View>
          );
        })}
      </View>
    </>
  );
}

/** What was, struck through, an arrow, and what comes; only what comes when nothing was. */
function Change({ from, to }: { from?: string; to: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.change, { gap: spacing.sm }]}>
      {from !== undefined ? (
        <>
          <Text color="textMuted" style={styles.struck}>
            {from}
          </Text>
          <Icon name="arrow" size={14} color="textMuted" />
        </>
      ) : null}
      {to}
    </View>
  );
}

/** A decided proposal, folded into a line: what became of it, and Undo after Apply. */
function DecidedLine({
  icon,
  iconColor,
  text,
  action,
}: {
  icon: IconName;
  iconColor: keyof ColorTokens;
  text: string;
  action?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Icon name={icon} size={18} color={iconColor} />
      <Text variant="bodyStrong" accessibilityLiveRegion="polite" style={styles.flex}>
        {text}
      </Text>
      {action}
    </View>
  );
}

/** Why the proposal could not be decided. */
function Refusal({ failure }: { failure: ProposalFailure }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Text
      variant="caption"
      color={failure === 'failed' ? 'danger' : 'textMuted'}
      accessibilityLiveRegion="polite"
      style={{ paddingTop: spacing.xs }}
    >
      {t(`bite.proposal.refusals.${failure}`)}
    </Text>
  );
}

/** A short summary of what a proposal changes, for the line it folds into once applied. */
function useSummary() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const workoutName = useWorkoutName();
  return (card: Proposal) => {
    if (card.kind === 'targets') {
      return t('bite.proposal.summary.targets', {
        calories: format(card.to.calories),
        protein: format(card.to.proteinG),
      });
    }
    const [first, second] = card.swaps;
    if (card.swaps.length === 1 && first) {
      return t('bite.proposal.summary.swap', { from: first.from, to: first.to });
    }
    if (card.swaps.length === 2 && first && second) {
      return t('bite.proposal.summary.twoSwaps', { first: first.to, second: second.to });
    }
    return t('bite.proposal.summary.swaps', {
      number: card.swaps.length,
      workout: workoutName({ name: card.workout.name, type: card.workout.type as Workout['type'] }),
    });
  };
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  row: {
    paddingVertical: spacing.sm,
    gap: 2,
  },
  target: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md + 2,
  },
});
