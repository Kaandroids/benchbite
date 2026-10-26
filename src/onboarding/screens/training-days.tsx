import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { RaisedPressable } from '@/components/ui/raised-pressable';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useUpperCase } from '@/i18n/case';
import { useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { MAX_TRAINING_DAYS, RECOMMENDED_DAYS } from '../training';
import { useStep } from '../use-step';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/** Whether no two days follow each other, Sunday and Monday included, so each has a rest after. */
function restAfterEach(days: number[]) {
  return days.every((day) => !days.includes((day % 7) + 1));
}

/**
 * The days of the week to train, starting on Monday, as one row of toggles with a summary of the
 * week under it. Until the user picks days, the recommendation for their experience is
 * selected, so it follows a change of experience.
 */
export function TrainingDaysStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const upperCase = useUpperCase();
  const { answers, progress, next, back } = useStep('training-days');
  const recommended = RECOMMENDED_DAYS[answers.experience ?? 'beginner'];
  const [chosen, setChosen] = useState(answers.trainingDaysChosen ?? false);
  const [days, setDays] = useState(
    chosen && answers.trainingDays ? answers.trainingDays : recommended,
  );
  const [limit, setLimit] = useState<'min' | 'max' | null>(null);
  const shortName = useWeekdayFormat('short');
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
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {t('onboarding.steps.training-days.title')}
        </Text>
        <Text color="textMuted">{t('onboarding.trainingDays.intro')}</Text>
      </View>
      <View style={[styles.row, { gap: spacing.xs }]}>
        {WEEKDAYS.map((weekday) => (
          <DayToggle
            key={weekday}
            weekday={weekday}
            selected={days.includes(weekday)}
            onPress={() => toggle(weekday)}
          />
        ))}
      </View>
      {limit ? (
        <Text color="danger" align="center">
          {t(
            limit === 'max'
              ? 'onboarding.trainingDays.maxReached'
              : 'onboarding.trainingDays.minReached',
          )}
        </Text>
      ) : null}
      <Card style={{ gap: spacing.sm }}>
        <Text variant="captionStrong" color="textMuted">
          {upperCase(t('onboarding.trainingDays.week'))}
        </Text>
        <Text variant="headline">
          {`${t('onboarding.trainingDays.count', { count: days.length })} · ${days
            .map((day) => shortName(day))
            .join(', ')}`}
        </Text>
        {restAfterEach(days) ? (
          <WeekNote icon="check" color="success" label={t('onboarding.trainingDays.restAfter')} />
        ) : null}
        {isRecommended ? (
          <WeekNote
            icon="target"
            color="primaryText"
            label={t('onboarding.trainingDays.recommended')}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

/** One day of the week, ticked in the brand colour when it is a training day. */
function DayToggle({
  weekday,
  selected,
  onPress,
}: {
  weekday: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radii } = useTheme();
  const longName = useWeekdayFormat();
  const shortName = useWeekdayFormat('short');
  return (
    <RaisedPressable
      accessibilityRole="checkbox"
      accessibilityLabel={longName(weekday)}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      haptic="selection"
      ledgeColor={selected ? colors.primaryButtonLedge : colors.border}
      borderRadius={radii.md}
      style={styles.day}
      faceStyle={[
        styles.dayFace,
        {
          backgroundColor: selected ? colors.primaryButton : colors.surface,
          borderColor: selected ? colors.primaryButton : colors.border,
        },
      ]}
    >
      <Text variant="label" color={selected ? 'onPrimary' : 'text'}>
        {shortName(weekday)}
      </Text>
    </RaisedPressable>
  );
}

/** A line about the week, with its icon. */
function WeekNote({
  icon,
  color,
  label,
}: {
  icon: 'check' | 'target';
  color: 'success' | 'primaryText';
  label: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <Icon name={icon} size={18} color={color} />
      <Text variant="bodyStrong" color={color} style={styles.flex}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  day: {
    flex: 1,
  },
  dayFace: {
    height: 56,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
