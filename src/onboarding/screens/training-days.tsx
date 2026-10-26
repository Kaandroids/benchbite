import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { backToBackRuns, MAX_TRAINING_DAYS, RECOMMENDED_DAYS } from '../training';
import { useStep } from '../use-step';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The days of the week to train, starting on Monday, as small cards with a line under them on
 * the week. Until the user picks days, the recommendation for their experience is selected, so
 * it follows a change of experience.
 */
export function TrainingDaysStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('training-days');
  const recommended = RECOMMENDED_DAYS[answers.experience ?? 'beginner'];
  const [chosen, setChosen] = useState(answers.trainingDaysChosen ?? false);
  const [days, setDays] = useState(
    chosen && answers.trainingDays ? answers.trainingDays : recommended,
  );
  const [limit, setLimit] = useState<'min' | 'max' | null>(null);
  const weekdayName = useWeekdayFormat();
  const shortName = useWeekdayFormat('short');
  const runs = backToBackRuns(days);

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
      <Text variant="title" accessibilityRole="header">
        {t('onboarding.steps.training-days.title')}
      </Text>
      <View style={{ gap: spacing.md }}>
        {WEEKDAYS.map((weekday) => (
          <ChoiceCard
            key={weekday}
            type="checkbox"
            title={weekdayName(weekday)}
            selected={days.includes(weekday)}
            onPress={() => toggle(weekday)}
            size="small"
          />
        ))}
      </View>
      {/* One line on the week; a limit just hit takes its place, so nothing below moves. */}
      <Text
        variant="bodyStrong"
        color={limit ? 'warning' : 'textMuted'}
        align="center"
        accessibilityLiveRegion="polite"
      >
        {limit
          ? t(
              limit === 'max'
                ? 'onboarding.trainingDays.maxReached'
                : 'onboarding.trainingDays.minReached',
            )
          : `${t('onboarding.trainingDays.count', { count: days.length })} · ${
              runs.length > 0
                ? t('onboarding.trainingDays.backToBack', {
                    days: runs
                      .map((run) => `${shortName(run[0]!)}–${shortName(run.at(-1)!)}`)
                      .join(', '),
                  })
                : t('onboarding.trainingDays.restAfter')
            }`}
      </Text>
    </Screen>
  );
}
