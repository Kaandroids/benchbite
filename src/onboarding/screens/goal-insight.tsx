import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';

import { GOAL_ICONS } from '../goal-icons';
import { useStep } from '../use-step';

/** A short, encouraging explanation of what the chosen goal takes. */
export function GoalInsightStep() {
  const { t } = useTranslation();
  const { answers, progress, next, back } = useStep('goal-insight');
  const goal = answers.goal ?? 'stay_healthy';

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <MessageView
        icon={GOAL_ICONS[goal]}
        title={t(`onboarding.goalInsight.${goal}.title`)}
        message={t(`onboarding.goalInsight.${goal}.body`)}
      />
    </Screen>
  );
}
