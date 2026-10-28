import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  changesWeight,
  defaultTargetKg,
  minHealthyWeightKg,
  PACE_RANGES,
  snapPace,
  targetWeightProblem,
} from '@/body/body';
import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Slider } from '@/components/ui/slider';
import { StepHeading } from '@/components/ui/step-heading';
import { SuccessBadge } from '@/components/ui/success-badge';
import { Text } from '@/components/ui/text';
import { ActivityChoices } from '@/goals/activity-choices';
import { GoalChoices } from '@/goals/goal-choices';
import { PaceNote } from '@/goals/pace-note';
import { TargetWeightNote } from '@/goals/target-weight-note';
import {
  paceIn,
  paceToKg,
  useNumberFormat,
  useWeightFormat,
  useWeightLabel,
  weightIn,
  weightToKg,
  type WeightUnit,
} from '@/i18n/units';
import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';
import { WEIGHT_RANGE_KG } from '@/weight/range';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import {
  answerChanges,
  answersFrom,
  paramsOf,
  stepsFor,
  targetsFromWas,
  wasParam,
  type AnswerChange,
  type RecalculateParams,
  type RecalculateStep,
} from './recalculate';
import {
  useNutritionTargets,
  useRecalculateTargets,
  useTargetBasis,
  type NutritionTargets,
  type TargetAnswers,
  type TargetBasis,
} from './targets';

/** The icon of each changed answer on the review, as on the daily goals. */
const CHANGE_ICONS: Record<AnswerChange['key'], IconName> = {
  goal: 'target',
  target: 'scale',
  pace: 'speed',
  activity: 'person',
};

/** How much a tap on minus or plus changes the target weight, in the user's unit. */
const TARGET_STEP = { kg: 0.5, lb: 1 };

type StepProps = {
  answers: TargetAnswers;
  basis: TargetBasis;
  weightKg: number;
  unit: WeightUnit;
  /** The progress through the steps, for the top bar. */
  progress: { sections: string[]; current: number; value: number; overall: number };
  /** Opens the next step with the answers so far. */
  next: (answers: TargetAnswers) => void;
};

/**
 * Working the calculated targets out again (ADR 0039): the goal, the target weight and pace for a
 * goal that changes the weight, the activity, and the new targets against the ones in use. Each
 * step is a screen of its own, so going back is the usual swipe; the answers so far are its route
 * parameters. The saved answers are where each step starts.
 */
export function RecalculateScreen() {
  const { step, ...params } = useLocalSearchParams<RecalculateParams & { step: string }>();
  if (step === 'done') {
    return <DoneScreen was={params.was} />;
  }
  return <StepScreen step={step} params={params} />;
}

/** Leaves the steps for the daily goals, from any of them. */
const leave = () => router.dismissTo('/nutrition/goals');

function StepScreen({ step, params }: { step: string; params: RecalculateParams }) {
  const { t } = useTranslation();
  const basis = useTargetBasis();
  const latest = useLatestWeight();
  const unit = useWeightUnit();
  const queries = [basis, latest, unit];

  if (!allLoaded(queries) || !basis.data || !latest.data || !unit.data) {
    return (
      <Screen onBack={() => router.back()} onClose={leave}>
        <LoadState queries={queries} />
      </Screen>
    );
  }

  const weightKg = latest.data.weightKg;
  const answers = answersFrom(params, basis.data, weightKg);
  const steps = stepsFor(answers.goal);
  const current = steps.includes(step as RecalculateStep) ? (step as RecalculateStep) : 'goal';
  const index = steps.indexOf(current);
  const props: StepProps = {
    answers,
    basis: basis.data,
    weightKg,
    unit: unit.data,
    progress: {
      sections: steps.map((name) => t(`nutrition.recalculate.sections.${name}`)),
      current: index,
      value: 1,
      overall: (index + 1) / steps.length,
    },
    next: (nextAnswers) => {
      const nextSteps = stepsFor(nextAnswers.goal);
      const following = nextSteps[nextSteps.indexOf(current) + 1];
      router.push({
        pathname: '/nutrition/recalculate/[step]',
        params: { step: following ?? 'review', ...paramsOf(nextAnswers) },
      });
    },
  };

  switch (current) {
    case 'goal':
      return <GoalStep {...props} />;
    case 'target':
      return <TargetStep {...props} />;
    case 'activity':
      return <ActivityStep {...props} />;
    case 'review':
      return <ReviewStep {...props} />;
  }
}

function GoalStep({ answers, basis, weightKg, progress, next }: StepProps) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(answers.goal);
  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button
          label={t('common.continue')}
          // The saved target and pace carry over to the same goal only.
          onPress={() => next(answersFrom({ goal, activity: answers.activity }, basis, weightKg))}
        />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.goal.title')}
        intro={t('nutrition.recalculate.goal.intro')}
      />
      <GoalChoices value={goal} onChange={setGoal} />
    </Screen>
  );
}

function TargetStep({ answers, basis, weightKg, unit, progress, next }: StepProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const formatWeight = useWeightFormat();
  const goal = changesWeight(answers.goal) ? answers.goal : 'lose_fat';
  const paceRange = PACE_RANGES[unit][goal];
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? defaultTargetKg(goal, weightKg, basis.heightCm),
  );
  // A pace saved before the limits changed may lie outside them.
  const [pace, setPace] = useState(() =>
    answers.weeklyPaceKg === null
      ? paceRange.default
      : snapPace(paceIn(unit, answers.weeklyPaceKg), paceRange),
  );

  // Someone already at the lower end of a healthy weight should not lose more.
  if (goal === 'lose_fat' && weightKg <= minHealthyWeightKg(basis.heightCm)) {
    return (
      <Screen
        progress={progress}
        onBack={() => router.back()}
        onClose={leave}
        footer={
          <Button label={t('onboarding.targetWeight.changeGoal')} onPress={() => router.back()} />
        }
      >
        <View style={[styles.centered, { gap: spacing.lg }]}>
          <IconTile name="heart" size={88} />
          <Text color="textMuted" align="center">
            {t('onboarding.targetWeight.alreadyLow')}
          </Text>
        </View>
      </Screen>
    );
  }

  const problem = targetWeightProblem(goal, weightKg, targetKg, basis.heightCm);
  const paceKg = paceToKg(unit, pace);
  const change = (steps: number) => {
    const shown = weightIn(unit, targetKg) + steps * TARGET_STEP[unit];
    setTargetKg(clamp(weightToKg(unit, shown), WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max));
  };

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button
          label={t('common.continue')}
          disabled={problem !== null}
          onPress={() => next({ ...answers, targetWeightKg: targetKg, weeklyPaceKg: paceKg })}
        />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.target.title')}
        intro={t('nutrition.recalculate.target.intro', {
          weight: formatWeight(weightKg, unit),
          unit,
        })}
      />
      <Card style={styles.center}>
        <Text variant="captionStrong" color="textMuted">
          {t('nutrition.recalculate.target.weight')}
        </Text>
        <View style={[styles.row, { gap: spacing.xl }]}>
          <RoundIconButton
            icon="minus"
            color="primary"
            background="iconBackground"
            label={t('nutrition.recalculate.target.lower')}
            onPress={() => change(-1)}
            size={44}
          />
          <Text variant="title" accessibilityLiveRegion="polite">
            {formatWeight(targetKg, unit)}{' '}
            <Text variant="bodyStrong" color="textMuted">
              {unit}
            </Text>
          </Text>
          <RoundIconButton
            icon="plus"
            color="primary"
            background="iconBackground"
            label={t('nutrition.recalculate.target.higher')}
            onPress={() => change(1)}
            size={44}
          />
        </View>
        <TargetWeightNote
          goal={goal}
          weightKg={weightKg}
          targetKg={targetKg}
          heightCm={basis.heightCm}
          unit={unit}
          problem={problem}
          onUseLowest={setTargetKg}
        />
      </Card>
      {problem === null ? (
        <Card>
          <View style={[styles.row, styles.between]}>
            <Text variant="label">{t('nutrition.recalculate.target.pace')}</Text>
            <Text variant="label">
              {t('onboarding.pace.perWeek', { value: format(pace), unit })}
            </Text>
          </View>
          <Slider
            accessibilityLabel={t('nutrition.recalculate.target.pace')}
            value={pace}
            onChange={setPace}
            min={paceRange.min}
            max={paceRange.max}
            step={paceRange.step}
            formatAccessibilityValue={(value) =>
              t('onboarding.pace.perWeek', { value: format(value), unit })
            }
            minLabel={t('onboarding.pace.slower')}
            maxLabel={t('onboarding.pace.faster')}
          />
          <PaceNote
            goal={goal}
            weightKg={weightKg}
            targetKg={targetKg}
            paceKg={paceKg}
            fastest={pace >= paceRange.max}
            unit={unit}
            align="left"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

function ActivityStep({ answers, progress, next }: StepProps) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState(answers.activity);
  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ ...answers, activity })} />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.activity.title')}
        intro={t('nutrition.recalculate.activity.intro')}
      />
      <ActivityChoices value={activity} onChange={setActivity} />
    </Screen>
  );
}

function ReviewStep({ answers, basis, unit, progress }: StepProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const weightLabel = useWeightLabel();
  const inUse = useNutritionTargets();
  const recalculate = useRecalculateTargets();
  const changes = answerChanges(basis, answers);
  const was = inUse.data;

  const shown = (key: AnswerChange['key'], value: string | number) => {
    switch (key) {
      case 'goal':
        return t(`onboarding.options.goal.${value as TargetBasis['goal']}`);
      case 'activity':
        return t(`onboarding.options.activityLevel.${value as TargetBasis['activity']}`);
      case 'target':
        return weightLabel(Number(value), unit);
      case 'pace':
        return t('nutrition.goals.perWeek', { value: format(paceIn(unit, Number(value))), unit });
    }
  };

  const calculate = () => {
    if (!was) {
      return;
    }
    recalculate.mutate(answers, {
      onSuccess: () => {
        // The steps close under the page with the new goals, so going back from it leaves.
        router.dismissTo('/nutrition/goals');
        router.push({
          pathname: '/nutrition/recalculate/[step]',
          params: { step: 'done', was: wasParam(was) },
        });
      },
    });
  };

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <View style={{ gap: spacing.md }}>
          {recalculate.isError ? (
            <FormError>{t('nutrition.recalculate.review.saveError')}</FormError>
          ) : null}
          <Button
            label={t('nutrition.recalculate.review.calculate')}
            loading={recalculate.isPending}
            disabled={changes.length === 0 || !was}
            onPress={calculate}
          />
        </View>
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.review.title')}
        intro={t('nutrition.recalculate.review.intro')}
      />
      {changes.length === 0 ? (
        <Card>
          <Text color="textMuted" align="center">
            {t('nutrition.recalculate.review.none')}
          </Text>
        </Card>
      ) : (
        <>
          <Card list>
            {changes.map((change, index) => {
              const label = t(`nutrition.recalculate.review.labels.${change.key}`);
              const to = shown(change.key, change.to);
              const from = change.from === null ? null : shown(change.key, change.from);
              return (
                <View
                  key={change.key}
                  accessible
                  accessibilityLabel={
                    from === null
                      ? `${label}: ${to}`
                      : t('nutrition.recalculate.review.changed', { label, from, to })
                  }
                  style={[
                    styles.row,
                    { gap: spacing.md, paddingVertical: spacing.md },
                    listDivider(index === 0, colors.border),
                  ]}
                >
                  <IconTile name={CHANGE_ICONS[change.key]} size={40} />
                  <View style={styles.flex}>
                    <Text variant="captionStrong" color="textMuted">
                      {label}
                    </Text>
                    <Text variant="label">
                      {from !== null ? (
                        <>
                          <Text variant="label" color="textMuted" style={styles.was}>
                            {from}
                          </Text>
                          <Text variant="label" color="textMuted">
                            {' → '}
                          </Text>
                        </>
                      ) : null}
                      {to}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
          <Text color="textMuted">{t('nutrition.recalculate.review.plan')}</Text>
        </>
      )}
      {inUse.isError && !was ? <LoadState queries={[inUse]} /> : null}
    </Screen>
  );
}

/** The page after saving: the new goals against the ones in use before. */
function DoneScreen({ was }: { was: string | undefined }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const inUse = useNutritionTargets();
  const from = targetsFromWas(was);
  const to = inUse.data;

  return (
    <Screen
      onClose={leave}
      footer={<Button label={t('nutrition.recalculate.done.done')} onPress={leave} />}
    >
      <View style={[styles.center, { gap: spacing.sm }]}>
        <SuccessBadge />
        <Text variant="title" align="center" accessibilityRole="header">
          {t('nutrition.recalculate.done.title')}
        </Text>
        <Text color="textMuted" align="center">
          {t('nutrition.recalculate.done.intro')}
        </Text>
      </View>
      {to ? (
        <>
          <Comparison from={from ?? to} to={to} />
          <Text color="textMuted">{t('nutrition.recalculate.done.note')}</Text>
        </>
      ) : (
        <LoadState queries={[inUse]} />
      )}
    </Screen>
  );
}

/** The new targets, each beside the one in use now when it changes. */
function Comparison({ from, to }: { from: NutritionTargets; to: NutritionTargets }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();

  const value = (was: number, now: number, large: boolean) => {
    const unit = large ? 'kcal' : 'g';
    return {
      label:
        was === now
          ? `${format(now)} ${unit}`
          : t('nutrition.recalculate.done.change', { from: format(was), to: format(now), unit }),
      node: (
        <Text variant="label">
          {was !== now ? (
            <>
              <Text variant="bodyStrong" color="textMuted" style={styles.was}>
                {format(was)}
              </Text>
              <Text variant="bodyStrong" color="textMuted">
                {' → '}
              </Text>
            </>
          ) : null}
          <Text variant={large ? 'headline' : 'label'} color={large ? 'primaryText' : 'text'}>
            {format(now)}{' '}
          </Text>
          <Text variant="bodyStrong" color="textMuted">
            {unit}
          </Text>
        </Text>
      ),
    };
  };

  const rows: { key: string; name: ReactNode; label: string; value: ReturnType<typeof value> }[] = [
    {
      key: 'calories',
      name: <Text variant="label">{t('nutrition.goals.calories')}</Text>,
      label: t('nutrition.goals.calories'),
      value: value(from.calories, to.calories, true),
    },
    ...MACROS.map(({ key, grams, color }) => ({
      key,
      name: (
        <View style={[styles.row, { gap: spacing.sm }]}>
          <MacroDot color={color} />
          <Text variant="label">{t(`nutrition.macros.${key}`)}</Text>
        </View>
      ),
      label: t(`nutrition.macros.${key}`),
      value: value(from[grams], to[grams], false),
    })),
  ];

  return (
    <Card list>
      {rows.map((row, index) => (
        <View
          key={row.key}
          accessible
          accessibilityLabel={`${row.label}: ${row.value.label}`}
          style={[
            styles.row,
            styles.between,
            { paddingVertical: spacing.md },
            listDivider(index === 0, colors.border),
          ]}
        >
          {row.name}
          {row.value.node}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  was: {
    textDecorationLine: 'line-through',
  },
});
