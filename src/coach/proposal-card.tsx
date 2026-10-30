import type { DayTargets, ProposalCard as Card } from '@shared/coach/chat';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
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
  card: Card;
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

  // What can no longer be applied says why in place of the buttons; a request that failed may be
  // tried again.
  const closed = state?.expired ? 'outOfDate' : refused === 'failed' ? undefined : refused;
  return (
    <Frame>
      {card.kind === 'workout' ? <WorkoutChange card={card} /> : <TargetsChange card={card} />}
      {closed ? (
        <Refusal failure={closed} />
      ) : (
        <>
          {refused ? <Refusal failure={refused} /> : null}
          <View style={styles.buttons}>
            <Button
              label={t('bite.proposal.apply')}
              size="small"
              style={styles.flex}
              disabled={waiting}
              loading={decide.isPending && decide.variables === 'apply'}
              onPress={() => choose('apply')}
            />
            <TextLink
              label={t('bite.proposal.keep')}
              tone="muted"
              size="regular"
              disabled={waiting || decide.isPending}
              onPress={() => choose('keep')}
            />
          </View>
        </>
      )}
    </Frame>
  );
}

/** The card's surface: white, on a small ledge, as the cards one acts on are. */
function Frame({ children }: { children: ReactNode }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.frame,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          padding: spacing.md + 2,
          gap: spacing.md,
        },
      ]}
    >
      {children}
    </View>
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
function workoutTarget(target: Extract<Card, { kind: 'workout' }>['swaps'][number]['target']) {
  return target.reps
    ? ({ reps: target.reps } satisfies WorkoutTarget)
    : ({ seconds: target.seconds ?? null, meters: target.meters ?? null } satisfies WorkoutTarget);
}

/** The exercises swapped: the old one struck through, the new one, its sets and why. */
function WorkoutChange({ card }: { card: Extract<Card, { kind: 'workout' }> }) {
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
              key={`${swap.from}-${swap.to}`}
              accessible
              accessibilityLabel={t('bite.proposal.swapLabel', {
                from: swap.from,
                to: swap.to,
                detail,
              })}
              style={[styles.row, rowDivider(index, colors)]}
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
  { key: 'calories', color: 'text', unit: 'kcal' },
  { key: 'proteinG', color: 'protein', unit: 'grams' },
  { key: 'carbsG', color: 'carbs', unit: 'grams' },
  { key: 'fatG', color: 'fat', unit: 'grams' },
] as const satisfies { key: keyof DayTargets; color: keyof ColorTokens; unit: string }[];

const MACRO_NAMES = {
  calories: 'bite.proposal.calories',
  proteinG: 'bite.proposal.protein',
  carbsG: 'bite.proposal.carbs',
  fatG: 'bite.proposal.fat',
} as const;

/** The targets that change: each one in use struck through, and the new one. */
function TargetsChange({ card }: { card: Extract<Card, { kind: 'targets' }> }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const changed = MACROS.filter(({ key }) => card.from?.[key] !== card.to[key]);
  const value = (unit: 'kcal' | 'grams', amount: number) =>
    t(`bite.proposal.${unit}`, { value: format(amount) });
  return (
    <>
      <Header title={t('bite.proposal.targetsTitle')} />
      <View>
        {changed.map(({ key, color, unit }, index) => {
          const from = card.from?.[key];
          const name = t(MACRO_NAMES[key]);
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
              style={[styles.row, styles.target, rowDivider(index, colors), { gap: spacing.sm }]}
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

/** The thin line above each row but the first. */
function rowDivider(index: number, colors: ColorTokens) {
  return index === 0 ? null : { borderTopWidth: 1, borderTopColor: colors.track };
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
  return (card: Card) => {
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
  frame: {
    borderWidth: 1,
    // A small ledge, as under the cards one acts on.
    borderBottomWidth: 3,
    borderRadius: radii.lg,
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
