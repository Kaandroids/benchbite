import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { defaultUnits, type WeightUnit } from '@/i18n/units';
import { WeightWheels } from '@/weight/weight-wheels';

import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

/** A typical weight to start the wheels from, so most people only scroll a little. */
const DEFAULT_WEIGHT_KG: Record<NonNullable<OnboardingAnswers['sex']>, number> = {
  female: 65,
  male: 80,
  unspecified: 72,
};

/** The current weight in kilograms or pounds; it is stored in kilograms either way. */
export function WeightStep() {
  const { t } = useTranslation();
  const { answers, progress, next, back, close } = useStep('weight');
  const [unit, setUnit] = useState<WeightUnit>(answers.weightUnit ?? defaultUnits().weight);
  const [weightKg, setWeightKg] = useState(
    answers.weightKg ?? DEFAULT_WEIGHT_KG[answers.sex ?? 'unspecified'],
  );

  return (
    <Screen
      progress={progress}
      onBack={back}
      onClose={close}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ weightKg, weightUnit: unit })} />
      }
    >
      <Text variant="title">{t('onboarding.steps.weight.title')}</Text>
      <SegmentedControl
        accessibilityLabel={t('onboarding.steps.weight.title')}
        options={[
          { value: 'kg', label: t('onboarding.units.kg') },
          { value: 'lb', label: t('onboarding.units.lb') },
        ]}
        value={unit}
        onChange={setUnit}
      />
      <CenteredContent>
        <WeightWheels
          kg={weightKg}
          unit={unit}
          onChange={setWeightKg}
          accessibilityLabel={t('onboarding.steps.weight.title')}
        />
      </CenteredContent>
    </Screen>
  );
}
