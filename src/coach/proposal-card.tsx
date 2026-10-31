import type { DayTargets, FoodLogChange } from '@shared/coach/chat';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { Was } from '@/components/ui/was';
import { daysBetween, fromIsoDate } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useDayName } from '@/nutrition/day-name';
import { spacing, useTheme, type ColorTokens } from '@/theme';
import { useTargetFormat, useWorkoutName } from '@/workouts/format';
import type { Workout, WorkoutTarget } from '@/workouts/workouts';

import { canUndo, cardFailure, refusalOf } from './cards';
import { CardRefusal as Refusal, DecidedLine } from './decided-line';
import {
  foodLogDays,
  type ProposalDecision,
  type ProposalState,
  type ProposalStatus,
  type ShownProposal as Proposal,
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
 * A change Bite proposed, under its answer (boards 4 and 11, ADR 0058, 0068): what changes, from
 * today, or in the food log, to apply or keep as it is. Once decided it folds into a line that
 * says so, and an applied one offers Undo (boards 5 and 11b).
 */
export function ProposalCard({ card, state, waiting = false }: ProposalCardProps) {
  const { t } = useTranslation();
  const decide = useDecideProposal(card);
  const summary = useSummary();
  const foodLogDetail = useFoodLogDetail();
  // What the user decided here wins over where it stood when loaded: states loading again, as for
  // a new proposal, may still hold it as it was before.
  const [decided, setDecided] = useState<ProposalStatus>();
  const status = decided ?? state?.status ?? 'pending';
  // A refusal says why on the card while the proposal stands where it was refused: an undo is
  // refused applied, the rest pending.
  const refused = refusalOf(decide, decide.variables === 'undo', status === 'applied');
  const choose = (decision: ProposalDecision) =>
    decide.mutate(decision, {
      onSuccess: setDecided,
      // Decided elsewhere: where it stands now, as loaded again, shows instead.
      onError: (error) => {
        if (cardFailure(error) === 'outOfDate') {
          setDecided(undefined);
        }
      },
    });

  if (status === 'applied') {
    return (
      <View>
        <DecidedLine
          icon="check"
          iconColor="success"
          text={t('bite.proposal.applied', { summary: summary(card) })}
          detail={card.kind === 'food_log' ? foodLogDetail(card) : undefined}
          action={
            // Undo stands as long as nothing changed what applying left, on a day still open.
            !canUndo(refused) ? undefined : (
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
      {card.kind === 'workout' ? (
        <WorkoutChange card={card} />
      ) : card.kind === 'targets' ? (
        <TargetsChange card={card} />
      ) : (
        <FoodLogChanges card={card} />
      )}
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

/** The card's title, and when the change counts from, or the day it changes. */
function Header({ title, tag }: { title: string; tag?: string | null }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const label = tag === undefined ? t('bite.proposal.fromToday') : tag;
  return (
    <View style={[styles.header, { gap: spacing.sm }]}>
      <Text variant="label" accessibilityRole="header" style={styles.flex}>
        {title}
      </Text>
      {label ? (
        <Text variant="captionStrong" color="textMuted">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

type WorkoutProposal = Extract<Proposal, { kind: 'workout' }>;

/**
 * The workout a proposal changes, as the app names it. The shared card keeps its type a plain
 * string, as the chat function's types import nothing; it is one of the database's.
 */
function proposedWorkout(card: WorkoutProposal): Pick<Workout, 'name' | 'type'> {
  return { name: card.workout.name, type: card.workout.type as Workout['type'] };
}

/** A target as the workouts format it. */
function workoutTarget(target: WorkoutProposal['swaps'][number]['target']) {
  return target.reps
    ? ({ reps: target.reps } satisfies WorkoutTarget)
    : ({ seconds: target.seconds ?? null, meters: target.meters ?? null } satisfies WorkoutTarget);
}

/** The exercises swapped: the old one struck through, the new one, its sets and why. */
function WorkoutChange({ card }: { card: WorkoutProposal }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const workoutName = useWorkoutName();
  const targetFormat = useTargetFormat();
  return (
    <>
      <Header title={workoutName(proposedWorkout(card))} />
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
              <Text variant="bodyStrong">
                <Was value={swap.from} variant="body" />
                {swap.to}
              </Text>
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
              <Text variant="label">
                {was !== undefined ? <Was value={was} variant="body" /> : null}
                <Text variant="label" color={color}>
                  {to}
                </Text>
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** A short summary of what a proposal changes, for the line it folds into once applied. */
function useSummary() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const workoutName = useWorkoutName();
  return (card: Proposal) => {
    if (card.kind === 'food_log') {
      return t('bite.proposal.summary.foodLog', { count: card.changes.length });
    }
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
      workout: workoutName(proposedWorkout(card)),
    });
  };
}

type FoodLogProposal = Extract<Proposal, { kind: 'food_log' }>;

/** Names a day of the food log by how far back it is: Today, Yesterday, or its weekday. */
function useLogDayName() {
  const dayName = useDayName();
  return (day: string) => {
    const date = fromIsoDate(day);
    return dayName(date, daysBetween(date, new Date()));
  };
}

/** The one day all of a proposal's changes are on, from and to; null when they span more. */
function dayOf(card: FoodLogProposal): string | null {
  const days = foodLogDays(card);
  return days.length === 1 ? days[0]! : null;
}

/**
 * The entries a food log proposal changes (board 11), on the day it names or each on its own:
 * where each moves, struck through where it was, its grams and calories, and those removed struck
 * through.
 */
function FoodLogChanges({ card }: { card: FoodLogProposal }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { format } = useNumberFormat();
  const dayName = useLogDayName();
  const day = dayOf(card);
  /** Where an entry is: its meal, and its day when the card names none. */
  const place = (entry: FoodLogChange['from']) => {
    const meal = t(`nutrition.meals.${entry.meal}`);
    return day ? meal : t('bite.foodLog.place', { meal, day: dayName(entry.day) });
  };
  const grams = (value: number) => t('nutrition.grams', { count: format(value) });
  const kcal = (value: number) => t('nutrition.kcal', { calories: format(Math.round(value)) });
  return (
    <>
      <Header title={t('bite.foodLog.title')} tag={day ? dayName(day) : null} />
      <View>
        {card.changes.map((change, index) => {
          const { food, from, to } = change;
          const style = [styles.row, listDivider(index === 0, colors.border)];
          if (!to) {
            const where = t(`bite.foodLog.remove.${from.meal}`);
            const detail = [
              day ? where : t('bite.foodLog.place', { meal: where, day: dayName(from.day) }),
              grams(from.grams),
              kcal(from.kcal),
            ].join(' · ');
            return (
              <View
                key={index}
                accessible
                accessibilityLabel={t('bite.foodLog.removeLabel', { food, detail })}
                style={style}
              >
                <Text variant="bodyStrong" color="textMuted" style={styles.struck}>
                  {food}
                </Text>
                <Text variant="caption" color="textMuted">
                  {detail}
                </Text>
              </View>
            );
          }
          const moved = to.meal !== from.meal || to.day !== from.day;
          const was = place(from);
          const now = place(to);
          const resized = to.grams !== from.grams;
          const label = [
            moved ? t('bite.foodLog.moveLabel', { from: was, to: now }) : was,
            resized
              ? t('bite.foodLog.moveLabel', { from: grams(from.grams), to: grams(to.grams) })
              : grams(to.grams),
            kcal(to.kcal),
          ].join(', ');
          return (
            <View key={index} accessible accessibilityLabel={`${food}, ${label}`} style={style}>
              <Text variant="bodyStrong">{food}</Text>
              <Text variant="caption" color="textMuted">
                {moved ? <Was value={was} variant="caption" /> : null}
                <Text
                  variant={moved ? 'captionStrong' : 'caption'}
                  color={moved ? 'text' : 'textMuted'}
                >
                  {now}
                </Text>
                {' · '}
                {resized ? <Was value={grams(from.grams)} variant="caption" /> : null}
                <Text
                  variant={resized ? 'captionStrong' : 'caption'}
                  color={resized ? 'text' : 'textMuted'}
                >
                  {grams(to.grams)}
                </Text>
                {` · ${kcal(to.kcal)}`}
              </Text>
            </View>
          );
        })}
      </View>
    </>
  );
}

/** What each change of an applied food log proposal did, in short, for the line under it. */
function useFoodLogDetail() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const dayName = useLogDayName();
  return (card: FoodLogProposal) =>
    card.changes
      .map(({ food, from, to }) => {
        if (!to) return t('bite.foodLog.summary.removed', { food });
        const day = dayName(to.day);
        // Where it went, naming the day too when that changed.
        const moved =
          to.meal !== from.meal
            ? to.day !== from.day
              ? t(`bite.foodLog.summary.movedOn.${to.meal}`, { food, day })
              : t(`bite.foodLog.summary.moved.${to.meal}`, { food })
            : to.day !== from.day
              ? t('bite.foodLog.summary.movedDay', { food, day })
              : undefined;
        const grams = t('nutrition.grams', { count: format(to.grams) });
        if (!moved) return t('bite.foodLog.summary.resized', { food, grams });
        return to.grams !== from.grams
          ? t('bite.foodLog.summary.withGrams', { change: moved, grams })
          : moved;
      })
      .join(' · ');
}

const styles = StyleSheet.create({
  struck: {
    textDecorationLine: 'line-through',
  },
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
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
});
