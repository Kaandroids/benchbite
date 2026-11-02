import type {
  CardWorkout,
  DayTargets,
  ExerciseChanges,
  FoodLogChange,
  ProposalTarget,
} from '@shared/coach/chat';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { Was } from '@/components/ui/was';
import { daysBetween, fromIsoDate, useWeekdayFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useDayName } from '@/nutrition/day-name';
import { radii, spacing, useTheme, type ColorTokens } from '@/theme';
import { useAlternativeName } from '@/workouts/alternatives';
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
 * A change Bite proposed, under its answer (boards 4, 11, 40, 42 and 43, ADR 0058, 0068, 0075):
 * what changes, from today, in the food log, or in a workout's alternatives, to apply or keep as
 * it is. Once decided it folds into a line that says so, and an applied one offers Undo (boards 5
 * and 11b).
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
      <ProposalBody card={card} />
      {line ? <Refusal failure={line} /> : null}
      {canKeep ? (
        <View style={styles.buttons}>
          {canApply ? (
            <Button
              label={t(applyLabel(card))}
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

/** What the button that applies `card` says: Use it for an alternative, Switch for a switch. */
function applyLabel(card: Proposal) {
  switch (card.kind) {
    case 'alternative':
      return 'bite.proposal.useIt';
    case 'alternative_switch':
      return 'bite.proposal.switch';
    default:
      return 'bite.proposal.apply';
  }
}

/** The one workout a change to workouts names, when it names one only. */
function onlyWorkout(card: WorkoutsProposal) {
  return card.workouts.length === 1 ? card.workouts[0] : undefined;
}

/** What a proposal changes, as its kind shows it. */
function ProposalBody({ card }: { card: Proposal }) {
  switch (card.kind) {
    case 'workout':
      return <WorkoutChange card={card} />;
    case 'workouts':
      return <WorkoutsChange card={card} />;
    case 'alternative':
      return <AlternativeChange card={card} />;
    case 'alternative_switch':
      return <AlternativeSwitch card={card} />;
    case 'targets':
      return <TargetsChange card={card} />;
    case 'food_log':
      return <FoodLogChanges card={card} />;
  }
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
 * A workout a proposal changes, as the app names it. The shared card keeps its type a plain
 * string, as the chat function's types import nothing; it is one of the database's.
 */
function proposedWorkout(workout: CardWorkout): Pick<Workout, 'name' | 'type'> {
  return { name: workout.name, type: workout.type as Workout['type'] };
}

/** A target as the workouts format it. */
function workoutTarget(target: ProposalTarget) {
  return target.reps
    ? ({ reps: target.reps } satisfies WorkoutTarget)
    : ({ seconds: target.seconds ?? null, meters: target.meters ?? null } satisfies WorkoutTarget);
}

/** The exercises swapped in one workout, as Bite proposed before ADR 0075. */
function WorkoutChange({ card }: { card: WorkoutProposal }) {
  const workoutName = useWorkoutName();
  return (
    <>
      <Header title={workoutName(proposedWorkout(card.workout))} />
      <ExerciseRows changes={{ swaps: card.swaps, removed: [], added: [] }} />
    </>
  );
}

/**
 * What a proposal changes in a workout's exercises: each one swapped, the old one struck through,
 * each one left out, struck through, and each one added, with their sets and why.
 */
function ExerciseRows({ changes }: { changes: ExerciseChanges }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const targetFormat = useTargetFormat();
  const detail = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');
  const rows = [
    ...changes.swaps.map((swap) => {
      const about = detail(targetFormat(swap.sets, workoutTarget(swap.target)), swap.why);
      return {
        label: t('bite.proposal.swapLabel', { from: swap.from, to: swap.to, detail: about }),
        main: (
          <Text variant="bodyStrong">
            <Was value={swap.from} variant="body" />
            {swap.to}
          </Text>
        ),
        about,
      };
    }),
    ...changes.removed.map((exercise) => {
      const about = detail(t('bite.proposal.removed'), exercise.why);
      return {
        label: `${exercise.name}, ${about}`,
        main: (
          <View style={[styles.marked, { gap: spacing.sm }]}>
            <Icon name="minus" size={14} color="danger" />
            <Text variant="bodyStrong" color="textMuted" style={[styles.flex, styles.struck]}>
              {exercise.name}
            </Text>
          </View>
        ),
        about,
      };
    }),
    ...changes.added.map((exercise) => {
      const about = detail(
        t('bite.proposal.added'),
        targetFormat(exercise.sets, workoutTarget(exercise.target)),
        exercise.why,
      );
      return {
        label: `${exercise.name}, ${about}`,
        main: (
          <View style={[styles.marked, { gap: spacing.sm }]}>
            <Icon name="plus" size={14} color="success" />
            <Text variant="bodyStrong" style={styles.flex}>
              {exercise.name}
            </Text>
          </View>
        ),
        about,
      };
    }),
  ];
  return (
    <View>
      {rows.map((row, index) => (
        <View
          key={index}
          accessible
          accessibilityLabel={row.label}
          style={[styles.row, listDivider(index === 0, colors.border)]}
        >
          {row.main}
          <Text variant="caption" color="textMuted">
            {row.about}
          </Text>
        </View>
      ))}
    </View>
  );
}

type WorkoutsProposal = Extract<Proposal, { kind: 'workouts' }>;

/**
 * Lasting changes to one or more workouts, applied together (board 43): one workout under its
 * name, several each under its name and days.
 */
function WorkoutsChange({ card }: { card: WorkoutsProposal }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const workoutName = useWorkoutName();
  const weekday = useWeekdayFormat('short');
  const only = onlyWorkout(card);
  if (only) {
    return (
      <>
        <Header title={workoutName(proposedWorkout(only.workout))} />
        <ExerciseRows changes={only} />
      </>
    );
  }
  return (
    <>
      <Header title={t('bite.proposal.workoutsTitle', { count: card.workouts.length })} />
      {card.workouts.map((changed, index) => (
        <View
          key={index}
          style={[listDivider(index === 0, colors.border), index > 0 && { paddingTop: spacing.sm }]}
        >
          <View style={[styles.header, { gap: spacing.sm }]}>
            <Text variant="bodyStrong" accessibilityRole="header" style={styles.flex}>
              {workoutName(proposedWorkout(changed.workout))}
            </Text>
            <Text variant="captionStrong" color="textMuted">
              {changed.weekdays.map(weekday).join(', ')}
            </Text>
          </View>
          <ExerciseRows changes={changed} />
        </View>
      ))}
    </>
  );
}

/** The alternative in use and the one a proposal puts in use, as chips (boards 40 and 42). */
function Alternatives({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('bite.proposal.alternativesLabel', { from, to })}
      style={[styles.chips, { gap: spacing.xs }]}
    >
      <View style={[styles.chip, { backgroundColor: colors.track }]}>
        <Text variant="captionStrong" color="textMuted">
          {from}
        </Text>
      </View>
      <Icon name="arrow" size={14} color="textMuted" />
      <View style={[styles.chip, { backgroundColor: colors.inverseSurface }]}>
        <Text variant="captionStrong" color="onInverse">
          {to}
        </Text>
      </View>
    </View>
  );
}

/**
 * A new alternative of a workout for a while (board 40): made from the one in use, which stays,
 * with what it changes.
 */
function AlternativeChange({ card }: { card: Extract<Proposal, { kind: 'alternative' }> }) {
  const { t } = useTranslation();
  const workoutName = useWorkoutName();
  const alternativeName = useAlternativeName();
  const workout = workoutName(proposedWorkout(card.workout));
  return (
    <>
      <Header title={workout} tag={t('bite.proposal.newAlternative')} />
      <Alternatives from={alternativeName(card.from)} to={card.to} />
      <ExerciseRows changes={card} />
      <Text variant="caption" color="textMuted">
        {t('bite.proposal.alternativeNote', { workout })}
      </Text>
    </>
  );
}

/**
 * Another alternative of a workout put in use (board 42), as when the user is better again: what
 * comes back, and that the one in use stays.
 */
function AlternativeSwitch({ card }: { card: Extract<Proposal, { kind: 'alternative_switch' }> }) {
  const { t } = useTranslation();
  const workoutName = useWorkoutName();
  const alternativeName = useAlternativeName();
  const from = alternativeName(card.from);
  return (
    <>
      <Header
        title={workoutName(proposedWorkout(card.workout))}
        tag={t('bite.proposal.switchTag')}
      />
      <Alternatives from={from} to={alternativeName(card.to)} />
      <Text variant="caption" color="textMuted">
        {card.back.length > 0
          ? t('bite.proposal.switchBack', {
              count: card.back.length,
              exercises: card.back.join(', '),
              from,
            })
          : t('bite.proposal.switchKept', { from })}
      </Text>
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
  const alternativeName = useAlternativeName();
  return (card: Proposal) => {
    if (card.kind === 'workouts') {
      const only = onlyWorkout(card);
      return only
        ? t('bite.proposal.summary.workout', {
            workout: workoutName(proposedWorkout(only.workout)),
          })
        : t('bite.proposal.summary.workouts', { count: card.workouts.length });
    }
    if (card.kind === 'alternative' || card.kind === 'alternative_switch') {
      return t('bite.proposal.summary.alternative', {
        workout: workoutName(proposedWorkout(card.workout)),
        name: card.kind === 'alternative' ? card.to : alternativeName(card.to),
      });
    }
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
      workout: workoutName(proposedWorkout(card.workout)),
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
  marked: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  chip: {
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
});
