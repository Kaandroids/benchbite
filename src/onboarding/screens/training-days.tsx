import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';

import { MAX_TRAINING_DAYS, RECOMMENDED_DAYS } from '../training';
import { useStep } from '../use-step';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The days of the week to train, starting on Monday. Until the user picks days, the
 * recommendation for their experience is selected, so it follows a change of experience.
 */
export function TrainingDaysStep() {
  const { t } = useTranslation();
  const { answers, progress, next, back } = useStep('training-days');
  const recommended = RECOMMENDED_DAYS[answers.experience ?? 'beginner'];
  const [chosen, setChosen] = useState(answers.trainingDaysChosen ?? false);
  const [days, setDays] = useState(
    chosen && answers.trainingDays ? answers.trainingDays : recommended,
  );
  const [limit, setLimit] = useState<'min' | 'max' | null>(null);
  const weekdayName = useWeekdayFormat();
  const isRecommended = days.join() === recommended.join();

  const toggle = (weekday: number) => {
    if (days.includes(weekday)) {
      if (days.length === 1) {
        setLimit('min');
        return;
      }
      setDays(days.filter((day) => day !== weekday));
    } else {
      if (days.length >= MAX_TRAINING_DAYS) {
        setLimit('max');
        return;
      }
      setDays([...days, weekday].sort((a, b) => a - b));
    }
    setLimit(null);
    setChosen(true);
  };

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button
          label={t('common.continue')}
          onPress={() => next({ trainingDays: days, trainingDaysChosen: chosen })}
        />
      }
    >
      <Text variant="title">{t('onboarding.steps.training-days.title')}</Text>
      <Text variant="bodyStrong" color="primaryText">
        {t('onboarding.trainingDays.count', { count: days.length })}
        {isRecommended ? ` · ${t('onboarding.trainingDays.recommended')}` : ''}
      </Text>
      {WEEKDAYS.map((weekday) => (
        <ChoiceCard
          key={weekday}
          type="checkbox"
          title={weekdayName(weekday)}
          selected={days.includes(weekday)}
          onPress={() => toggle(weekday)}
        />
      ))}
      {limit ? (
        <Text color="danger" align="center">
          {t(
            limit === 'max'
              ? 'onboarding.trainingDays.maxReached'
              : 'onboarding.trainingDays.minReached',
          )}
        </Text>
      ) : null}
    </Screen>
  );
}
