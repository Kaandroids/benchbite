import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import type { Step } from '../steps';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const { Enums } = Constants.public;

type ChoiceField = keyof typeof CHOICES;

/** Steps with a single choice, answered by tapping an option. */
const CHOICES = {
  goal: Enums.goal_kind,
  sex: Enums.sex,
  activityLevel: Enums.activity_level,
  experience: Enums.experience,
  setup: Enums.training_setup,
} as const;

type PlaceholderStepProps = {
  step: Step;
  /** Asks a single-choice question with these options. */
  choice?: ChoiceField;
  /** Answers given as soon as the user continues, until the step's real screen exists. */
  defaults?: (answers: OnboardingAnswers) => OnboardingAnswers;
};

/**
 * A stand-in for an onboarding step whose screen comes in a later pull request, so the flow can
 * be walked through already. Single-choice steps offer their options; other steps answer with
 * sensible defaults.
 */
export function PlaceholderStep({ step, choice, defaults }: PlaceholderStepProps) {
  const { t } = useTranslation();
  const { answers, progress, next, back } = useStep(step);
  const fallback = defaults?.(answers);
  // The option labels of the step's field, such as onboarding.options.goal.lose_fat.
  const labels = choice
    ? (t('onboarding.options', { returnObjects: true })[choice] as Record<string, string>)
    : {};

  return (
    <Screen
      progress={step === 'welcome' ? undefined : progress}
      onBack={back}
      footer={
        choice ? undefined : <Button label={t('common.continue')} onPress={() => next(fallback)} />
      }
    >
      <Text variant="title">{t(`onboarding.steps.${step}.title`)}</Text>
      {choice
        ? CHOICES[choice].map((option) => (
            <ChoiceCard
              key={option}
              title={labels[option] ?? option}
              selected={answers[choice] === option}
              onPress={() => next({ [choice]: option })}
            />
          ))
        : null}
      {fallback ? (
        <Text color="textMuted">
          {t('onboarding.placeholder', { value: JSON.stringify(fallback) })}
        </Text>
      ) : null}
    </Screen>
  );
}
