import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';

import { useStep } from '../use-step';

/** Sex, which the calorie calculation needs; "prefer not to say" uses an average. */
export function SexStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('sex');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.sex.title')}</Text>
      {Constants.public.Enums.sex.map((sex) => (
        <ChoiceCard
          key={sex}
          title={t(`onboarding.options.sex.${sex}`)}
          selected={answers.sex === sex}
          onPress={() => choose({ sex })}
        />
      ))}
    </Screen>
  );
}
