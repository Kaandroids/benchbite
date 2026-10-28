import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PACE_RANGES, startingPace } from '@/body/body';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Slider } from '@/components/ui/slider';
import { Text } from '@/components/ui/text';
import { PaceNote } from '@/goals/pace-note';
import { paceToKg, useNumberFormat } from '@/i18n/units';

import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

/** How fast to reach the target, with how demanding that is and when the target is reached. */
export function PaceStep() {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const { answers, progress, next, back } = useStep('pace');
  const goal = answers.goal === 'build_muscle' ? 'build_muscle' : 'lose_fat';
  const unit = answers.weightUnit ?? 'kg';
  const weightKg = answers.weightKg ?? 72;
  const targetKg = answers.targetWeightKg ?? weightKg;
  const paceRange = PACE_RANGES[unit][goal];
  const [pace, setPace] = useState(() => startingPace(unit, goal, answers.weeklyPaceKg));
  const paceKg = paceToKg(unit, pace);

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ weeklyPaceKg: paceKg })} />
      }
    >
      <Text variant="title">{t('onboarding.steps.pace.title')}</Text>
      <CenteredContent
        below={
          <>
            <PaceNote
              goal={goal}
              weightKg={weightKg}
              targetKg={targetKg}
              paceKg={paceKg}
              fastest={pace >= paceRange.max}
              unit={unit}
            />
            <Text variant="caption" color="textMuted" align="center">
              {t('onboarding.pace.disclaimer')}
            </Text>
          </>
        }
      >
        <Text variant="display" align="center">
          {t('onboarding.pace.perWeek', {
            value: format(pace, { minimumFractionDigits: 2 }),
            unit,
          })}
        </Text>
        <Slider
          accessibilityLabel={t('onboarding.steps.pace.title')}
          value={pace}
          onChange={setPace}
          min={paceRange.min}
          max={paceRange.max}
          step={paceRange.step}
          formatAccessibilityValue={(value) =>
            t('onboarding.pace.perWeek', { value: format(value), unit })
          }
          minLabel={t('onboarding.pace.slower')}
          maxLabel={t('onboarding.pace.faster')}
        />
      </CenteredContent>
    </Screen>
  );
}
