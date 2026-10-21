import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

import type { Step } from '../steps';
import { useStep } from '../use-step';

/**
 * A stand-in for an onboarding step whose screen comes in a later pull request (#19, #20), so the
 * flow can be walked through already.
 */
export function PlaceholderStep({ step }: { step: Step }) {
  const { t } = useTranslation();
  const { progress, next, back } = useStep(step);

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <Text variant="title">{t(`onboarding.steps.${step}.title`)}</Text>
    </Screen>
  );
}
