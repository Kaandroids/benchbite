import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
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
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Slider } from '@/components/ui/slider';
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
  weightIn,
  weightToKg,
  type WeightUnit,
} from '@/i18n/units';
import { clamp } from '@/lib/math';
import { StepHeading } from '@/onboarding/step-heading';
import { useTheme } from '@/theme';
import { WEIGHT_RANGE_KG } from '@/weight/range';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { MacroDot } from './macro-dot';
import { MACROS } from './macro-targets';
import {
  answersFrom,
  changesWeight,
  paramsOf,
  stepsFor,
  type RecalculateParams,
  type RecalculateStep,
} from './recalculate';
import {
  useNutritionTargets,
  usePreviewTargets,
  useRecalculateTargets,
  useTargetBasis,
  type NutritionTargets,
  type TargetAnswers,
  type TargetBasis,
} from './targets';

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
  const { t } = useTranslation();
  const basis = useTargetBasis();
  const latest = useLatestWeight();
  const unit = useWeightUnit();
  const queries = [basis, latest, unit];

  if (!allLoaded(queries) || !basis.data || !latest.data || !unit.data) {
    return (
      <Screen onBack={() => router.back()}>
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
        params: { step: following ?? 'result', ...paramsOf(nextAnswers) },
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
    case 'result':
      return <ResultStep {...props} />;
  }
}

function GoalStep({ answers, basis, weightKg, progress, next }: StepProps) {
  const { t } = useTranslation();
  const [goal, setGoal] = useState(answers.goal);
  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
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

function ResultStep({ answers, progress }: StepProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const preview = usePreviewTargets(answers);
  const inUse = useNutritionTargets();
  const recalculate = useRecalculateTargets();
  const queries = [preview, inUse];
  const from = inUse.data;
  const to = preview.data;
  const ready = allLoaded(queries) && from && to;

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      footer={
        <View style={{ gap: spacing.md }}>
          {recalculate.isError ? (
            <FormError>{t('nutrition.recalculate.result.saveError')}</FormError>
          ) : null}
          <Button
            label={t('nutrition.recalculate.result.use')}
            loading={recalculate.isPending}
            disabled={!ready}
            onPress={() =>
              recalculate.mutate(answers, {
                onSuccess: () => router.dismissTo('/nutrition/goals'),
              })
            }
          />
        </View>
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.result.title')}
        intro={t('nutrition.recalculate.result.intro')}
      />
      {from && to ? (
        <>
          <Comparison from={from} to={to} />
          <Text color="textMuted">{t('nutrition.recalculate.result.note')}</Text>
        </>
      ) : (
        <LoadState queries={queries} />
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
          : t('nutrition.recalculate.result.change', { from: format(was), to: format(now), unit }),
      node: (
        <Text variant="label">
          {was !== now ? (
            <>
              <Text variant="bodyStrong" color="textMuted" style={styles.was}>
                {format(was)}
              </Text>
              <Text variant="bodyStrong" color="textMuted">
                {large ? ' ' : ' → '}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  was: {
    textDecorationLine: 'line-through',
  },
});
