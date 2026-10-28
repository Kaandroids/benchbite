import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Constants } from '@/lib/database.types';

import { ChoiceInsight, InsightRow } from '../choice-insight';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const ICONS: Record<NonNullable<OnboardingAnswers['setup']>, IconName> = {
  gym: 'gym',
  dumbbells: 'home',
  bodyweight: 'person',
};

/** What a setup means for the plan, one row each. */
const FACTS: { key: 'need' | 'exercises' | 'progress'; icon: IconName }[] = [
  { key: 'need', icon: 'dumbbell' },
  { key: 'exercises', icon: 'layers' },
  { key: 'progress', icon: 'trend' },
];

/**
 * Where the user trains, and a card on what it means: what is needed, which kinds of exercises
 * the plan uses (a setup's own equipment and less), and how to progress with it. The
 * descriptions say what the plan builder assumes for each setup, such as dumbbells without a
 * bench. Choosing saves the answer, and Continue moves on.
 */
export function SetupStep() {
  const { t } = useTranslation();
  const { answers, select, next, bar } = useStep('setup');
  const setup = answers.setup;

  return (
    <Screen
      {...bar}
      footer={<Button label={t('common.continue')} disabled={!setup} onPress={() => next()} />}
    >
      <StepHeading title={t('onboarding.steps.setup.title')} intro={t('onboarding.setup.intro')} />
      {Constants.public.Enums.training_setup.map((option) => (
        <ChoiceCard
          key={option}
          icon={ICONS[option]}
          title={t(`onboarding.options.setup.${option}`)}
          description={t(`onboarding.setup.descriptions.${option}`)}
          selected={setup === option}
          onPress={() => select({ setup: option })}
          size="compact"
        />
      ))}
      <ChoiceInsight title={t('onboarding.setup.means')} choice={setup}>
        {setup
          ? FACTS.map(({ key, icon }) => (
              <InsightRow
                key={key}
                icon={icon}
                label={t(`onboarding.setup.${key}`)}
                value={t(`onboarding.setup.facts.${setup}.${key}`)}
              />
            ))
          : null}
      </ChoiceInsight>
    </Screen>
  );
}
