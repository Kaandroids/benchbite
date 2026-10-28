import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import {
  changesWeight,
  defaultTargetKg,
  isTooLightToLose,
  PACE_RANGES,
  startingPace,
  targetWeightProblem,
} from '@/body/body';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Screen } from '@/components/ui/screen';
import { Slider } from '@/components/ui/slider';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { PaceNote } from '@/goals/pace-note';
import { TargetWeightNote } from '@/goals/target-weight-note';
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
  const paceRange = PACE_RANGES[unit][goal];
  const [targetKg, setTargetKg] = useState(
    answers.targetWeightKg ?? defaultTargetKg(goal, weightKg, basis.heightCm),
  );
  const [pace, setPace] = useState(() => startingPace(unit, goal, answers.weeklyPaceKg));

  // Someone already at the lower end of a healthy weight should not lose more.
  if (goal === 'lose_fat' && isTooLightToLose(weightKg, basis.heightCm)) {
    return (
      <Screen
        progress={progress}
        onBack={() => router.back()}
        onClose={leave}
        footer={
          <Button label={t('onboarding.targetWeight.changeGoal')} onPress={() => router.back()} />
        }
      >
        <View style={[styles.centered, { gap: spacing.lg }]}>
          <IconTile name="heart" size={88} />
          <Text color="textMuted" align="center">
            {t('onboarding.targetWeight.alreadyLow')}
          </Text>
        </View>
      </Screen>
    );
  }

  const problem = targetWeightProblem(goal, weightKg, targetKg, basis.heightCm);
  const paceKg = paceToKg(unit, pace);
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
            <Text variant="label">
              {t('onboarding.pace.perWeek', { value: format(pace), unit })}
            </Text>
          </View>
          <Slider
            accessibilityLabel={t('nutrition.recalculate.target.pace')}
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
          <PaceNote
            goal={goal}
            weightKg={weightKg}
            targetKg={targetKg}
            paceKg={paceKg}
            fastest={pace >= paceRange.max}
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
