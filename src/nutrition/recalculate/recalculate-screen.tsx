import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { allLoaded, LoadState } from '@/components/load-state';
import { Screen } from '@/components/ui/screen';
import { useLatestWeight, useWeightUnit } from '@/weight/weights';

import { useTargetBasis } from '../targets';
import { ActivityStep } from './activity-step';
import {
  answerChanges,
  answersFrom,
  paramsOf,
  stepsFor,
  type RecalculateParams,
  type RecalculateRoute,
  type RecalculateStep,
} from './answers';
import { BuildingStep, wasOpened } from './building-step';
import { DoneScreen } from './done-screen';
import { GoalStep } from './goal-step';
import { ReviewStep } from './review-step';
import { leave, type StepProps } from './step';
import { TargetStep } from './target-step';

/**
 * Working the calculated targets out again (ADR 0039): the goal, the target weight and pace for a
 * goal that changes the weight, the activity, the review, the save with the onboarding's
 * animation, and the new targets against the ones in use. Each step is a screen of its own, so
 * going back is the usual swipe; the answers so far are its route parameters. The saved answers
 * are where each step starts.
 */
export function RecalculateScreen() {
  const { step, ...params } = useLocalSearchParams<
    RecalculateParams & { step: RecalculateRoute }
  >();
  if (step === 'done') {
    return <DoneScreen was={params.was} />;
  }
  return <StepScreen step={step} params={params} />;
}

function StepScreen({ step, params }: { step: RecalculateRoute; params: RecalculateParams }) {
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
  if (step === 'building') {
    // Only the review starts a save, and only of a change; a link opens the review instead.
    if (!wasOpened(params.save) || answerChanges(basis.data, answers).length === 0) {
      return (
        <Redirect
          href={{
            pathname: '/nutrition/recalculate/[step]',
            params: { step: 'review', ...paramsOf(answers) },
          }}
        />
      );
    }
    return <BuildingStep answers={answers} weightKg={weightKg} unit={unit.data} was={params.was} />;
  }
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
