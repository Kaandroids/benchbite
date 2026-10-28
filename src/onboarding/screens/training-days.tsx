import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { CheckBox } from '@/components/ui/check-box';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { backToBackRuns, MAX_TRAINING_DAYS, RECOMMENDED_DAYS } from '../training';
import { useStep } from '../use-step';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The days of the week to train, starting on Monday, as one list with what the days make under
 * it. Until the user picks days, the recommendation for their experience is selected, so
 * it follows a change of experience.
 */
export function TrainingDaysStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, next, bar } = useStep('training-days');
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
      {...bar}
      footer={
        <Button
          label={t('common.continue')}
          onPress={() => next({ trainingDays: days, trainingDaysChosen: chosen })}
        />
      }
    >
      <StepHeading
        title={t('onboarding.steps.training-days.title')}
        intro={t('onboarding.trainingDays.intro')}
      />
      {/* The week as one list, so it reads as a whole rather than seven separate cards. */}
      <Card list style={[styles.week, { marginTop: spacing.sm }]}>
        {WEEKDAYS.map((weekday) => (
          <DayRow
            key={weekday}
            name={weekdayName(weekday)}
            first={weekday === WEEKDAYS[0]}
            selected={days.includes(weekday)}
            onPress={() => toggle(weekday)}
          />
        ))}
      </Card>
      {/* What the days make; a limit just hit takes the place of the second line. */}
      <View style={{ gap: spacing.xs, marginTop: spacing.sm }} accessibilityLiveRegion="polite">
        <Text variant="bodyStrong" align="center">
          {t('onboarding.trainingDays.count', { count: days.length })}
        </Text>
        <Text variant="caption" color={limit ? 'warning' : 'textMuted'} align="center">
          {limit
            ? t(
                limit === 'max'
                  ? 'onboarding.trainingDays.maxReached'
                  : 'onboarding.trainingDays.minReached',
              )
            : runs.length > 0
              ? t('onboarding.trainingDays.backToBack', {
                  days: runs
                    .map((run) => `${shortName(run[0]!)}–${shortName(run.at(-1)!)}`)
                    .join(', '),
                })
              : t('onboarding.trainingDays.restAfter')}
        </Text>
      </View>
    </Screen>
  );
}

type DayRowProps = {
  name: string;
  /** The first row, without a line above it. */
  first: boolean;
  selected: boolean;
  onPress: () => void;
};

/** One day of the week, tinted and ticked when it is a training day; the tick alone is orange. */
function DayRow({ name, first, selected, onPress }: DayRowProps) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [
        styles.day,
        listDivider(first, colors.border),
        {
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: selected ? colors.selected : colors.surface,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text variant="bodyStrong" style={styles.flex}>
        {name}
      </Text>
      <CheckBox checked={selected} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Rows reach the card's edges, and the card's corners clip their tint.
  week: {
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  flex: {
    flex: 1,
  },
});
