import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { ActivityChoices } from '@/goals/activity-choices';

import { leave, type StepProps } from './step';

export function ActivityStep({ answers, progress, next }: StepProps) {
  const { t } = useTranslation();
  const [activity, setActivity] = useState(answers.activity);
  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ ...answers, activity })} />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.activity.title')}
        intro={t('nutrition.recalculate.activity.intro')}
      />
      <ActivityChoices value={activity} onChange={setActivity} />
    </Screen>
  );
}
