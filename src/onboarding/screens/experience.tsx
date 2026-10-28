import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Constants } from '@/lib/database.types';
import { prescribe } from '@shared/plan/prescription';
import { splitFor } from '@shared/plan/split';

import { ChoiceInsight, InsightRow } from '../choice-insight';
import { required } from '../plan-request';
import { RECOMMENDED_DAYS } from '../training';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type Experience = NonNullable<OnboardingAnswers['experience']>;

const LEVELS = Constants.public.Enums.experience;

/**
 * Experience, each level with a mark of one to three bars, and a card on what the chosen level
 * sets: the suggested week and the sets of the main lifts, from the plan builder's own rules.
 * Choosing saves the answer, and Continue moves on.
 */
export function ExperienceStep() {
  const { t } = useTranslation();
  const { answers, select, next, bar } = useStep('experience');
  const experience = answers.experience;

  return (
    <Screen
      {...bar}
      footer={<Button label={t('common.continue')} disabled={!experience} onPress={() => next()} />}
    >
      <StepHeading
        title={t('onboarding.steps.experience.title')}
        intro={t('onboarding.experience.intro')}
      />
      {LEVELS.map((level, index) => (
        <ChoiceCard
          key={level}
          title={t(`onboarding.options.experience.${level}`)}
          description={t(`onboarding.experience.descriptions.${level}`)}
          level={{ value: index + 1, of: LEVELS.length }}
          selected={experience === level}
          onPress={() => select({ experience: level })}
          size="compact"
        />
      ))}
      <ChoiceInsight title={t('onboarding.experience.plan')} choice={experience}>
        {experience ? <LevelPlan experience={experience} goal={required(answers, 'goal')} /> : null}
      </ChoiceInsight>
    </Screen>
  );
}

/** The suggested week and the main lifts' starting sets for the level. */
function LevelPlan({
  experience,
  goal,
}: {
  experience: Experience;
  goal: NonNullable<OnboardingAnswers['goal']>;
}) {
  const { t } = useTranslation();
  const days = RECOMMENDED_DAYS[experience].length;
  const types = [...new Set(splitFor(days, experience))]
    .map((type) => t(`workout.sessionTypes.${type}`))
    .join(', ');
  const sets = prescribe(goal, experience, 'main', ['reps']).sets;
  return (
    <>
      <InsightRow
        icon="calendar"
        label={t('onboarding.experience.week')}
        value={t('onboarding.experience.days', { count: days, types })}
      />
      <InsightRow
        icon="dumbbell"
        label={t('onboarding.experience.main')}
        value={t('onboarding.experience.sets', { count: sets })}
      />
    </>
  );
}
