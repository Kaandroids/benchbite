import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const ICONS: Record<NonNullable<OnboardingAnswers['setup']>, IconName> = {
  gym: 'gym',
  dumbbells: 'home',
  bodyweight: 'person',
};

/**
 * Where the user trains. The descriptions say what the plan builder assumes for each setup, such
 * as dumbbells without a bench.
 */
export function SetupStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('setup');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.setup.title')}</Text>
      {Constants.public.Enums.training_setup.map((setup) => (
        <ChoiceCard
          key={setup}
          icon={ICONS[setup]}
          title={t(`onboarding.options.setup.${setup}`)}
          description={t(`onboarding.setup.descriptions.${setup}`)}
          selected={answers.setup === setup}
          onPress={() => choose({ setup })}
        />
      ))}
    </Screen>
  );
}
