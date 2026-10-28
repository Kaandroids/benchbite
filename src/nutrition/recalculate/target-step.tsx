import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  changesWeight,
  defaultTargetKg,
  isPaceInRange,
  isTooLightToLose,
  startingPace,
  targetWeightProblem,
} from '@/body/body';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { PaceNote } from '@/goals/pace-note';
import { PaceSlider } from '@/goals/pace-slider';
import { TargetWeightNote } from '@/goals/target-weight-note';
import { TooLightToLose } from '@/goals/too-light-to-lose';
import { paceToKg, useNumberFormat, useWeightFormat, weightIn, weightToKg } from '@/i18n/units';
import { clamp } from '@/lib/math';
import { useTheme } from '@/theme';
import { WEIGHT_RANGE_KG } from '@/weight/range';

import { leave, type StepProps } from './step';

/** How much a tap on minus or plus changes the target weight, in the user's unit. */
const TARGET_STEP = { kg: 0.5, lb: 1 };

export function TargetStep({ answers, basis, weightKg, unit, progress, next }: StepProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const formatWeight = useWeightFormat();
  const goal = changesWeight(answers.goal) ? answers.goal : 'lose_fat';
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? defaultTargetKg(goal, weightKg, basis.heightCm),
  );
  const [pace, setPace] = useState(() => startingPace(unit, goal, answers.weeklyPaceKg));
  const [paceMoved, setPaceMoved] = useState(false);

  // Someone already at the lower end of a healthy weight should not lose more.
  if (goal === 'lose_fat' && isTooLightToLose(weightKg, basis.heightCm)) {
    return (
      <Screen
        progress={progress}
        onBack={() => router.back()}
        onClose={leave}
        footer={<Button label={t('goals.targetWeight.changeGoal')} onPress={() => router.back()} />}
      >
        <TooLightToLose />
      </Screen>
    );
  }

  const problem = targetWeightProblem(goal, weightKg, targetKg, basis.heightCm);
  // The saved pace stays until the slider moves: on the slider's steps it may round, as one saved
  // in the other unit does, and would then count as a change nobody made.
  const saved = answers.weeklyPaceKg;
  const paceKg =
    !paceMoved && saved !== null && isPaceInRange(unit, goal, saved) ? saved : paceToKg(unit, pace);
  const change = (steps: number) => {
    const shown = weightIn(unit, targetKg) + steps * TARGET_STEP[unit];
    setTargetKg(clamp(weightToKg(unit, shown), WEIGHT_RANGE_KG.min, WEIGHT_RANGE_KG.max));
  };

  return (
    <Screen
      progress={progress}
      onBack={() => router.back()}
      onClose={leave}
      footer={
        <Button
          label={t('common.continue')}
          disabled={problem !== null}
          onPress={() => next({ ...answers, targetWeightKg: targetKg, weeklyPaceKg: paceKg })}
        />
      }
    >
      <StepHeading
        title={t('nutrition.recalculate.target.title')}
        intro={t('nutrition.recalculate.target.intro', {
          weight: formatWeight(weightKg, unit),
          unit,
        })}
      />
      <Card style={styles.center}>
        <Text variant="captionStrong" color="textMuted">
          {t('nutrition.recalculate.target.weight')}
        </Text>
        <View style={[styles.row, { gap: spacing.xl }]}>
          <RoundIconButton
            icon="minus"
            color="primary"
            background="iconBackground"
            label={t('nutrition.recalculate.target.lower')}
            onPress={() => change(-1)}
            size={44}
          />
          <Text variant="title" accessibilityLiveRegion="polite">
            {formatWeight(targetKg, unit)}{' '}
            <Text variant="bodyStrong" color="textMuted">
              {unit}
            </Text>
          </Text>
          <RoundIconButton
            icon="plus"
            color="primary"
            background="iconBackground"
            label={t('nutrition.recalculate.target.higher')}
            onPress={() => change(1)}
            size={44}
          />
        </View>
        <TargetWeightNote
          goal={goal}
          weightKg={weightKg}
          targetKg={targetKg}
          heightCm={basis.heightCm}
          unit={unit}
          problem={problem}
          onUseLowest={setTargetKg}
        />
      </Card>
      {problem === null ? (
        <Card>
          <View style={[styles.row, styles.between]}>
            <Text variant="label">{t('nutrition.recalculate.target.pace')}</Text>
            <Text variant="label">{t('goals.pace.perWeek', { value: format(pace), unit })}</Text>
          </View>
          <PaceSlider
            goal={goal}
            unit={unit}
            value={pace}
            onChange={(value) => {
              setPace(value);
              setPaceMoved(true);
            }}
            accessibilityLabel={t('nutrition.recalculate.target.pace')}
          />
          <PaceNote
            goal={goal}
            weightKg={weightKg}
            targetKg={targetKg}
            paceKg={paceKg}
            unit={unit}
            align="left"
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  center: {
    alignItems: 'center',
  },
});
