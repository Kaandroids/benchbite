import { useTranslation } from 'react-i18next';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';

import { SESSION_MINUTES } from '../training';
import { useStep } from '../use-step';

/** How long a workout may take; the plan builder fits each session into it. */
export function SessionLengthStep() {
  const { t } = useTranslation();
  const { answers, progress, back, choose } = useStep('session-length');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title">{t('onboarding.steps.session-length.title')}</Text>
      {SESSION_MINUTES.map((sessionMinutes) => (
        <ChoiceCard
          key={sessionMinutes}
          icon="timer"
          title={
            sessionMinutes === 75
              ? t('onboarding.sessionLength.longest')
              : t('onboarding.minutes', { count: sessionMinutes })
          }
          description={t(`onboarding.sessionLength.descriptions.${sessionMinutes}`)}
          selected={answers.sessionMinutes === sessionMinutes}
          onPress={() => choose({ sessionMinutes })}
        />
      ))}
    </Screen>
  );
}
