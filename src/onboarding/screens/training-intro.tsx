import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';

import { useStep } from '../use-step';

/** The turn from body data to training. */
export function TrainingIntroStep() {
  const { t } = useTranslation();
  const { progress, next, back } = useStep('training-intro');

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <MessageView
        icon="dumbbell"
        title={t('onboarding.steps.training-intro.title')}
        message={t('onboarding.trainingIntro.body')}
      />
    </Screen>
  );
}
