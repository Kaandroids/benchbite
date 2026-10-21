import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Slider } from '@/components/ui/slider';
import { Text } from '@/components/ui/text';
import { paceIn, paceToKg, useNumberFormat, weightIn } from '@/i18n/units';
import { useTheme, type ColorTokens } from '@/theme';

import { PACE_RANGES, paceLevel, projectedDate, type PaceLevel } from '../body';
import { useStep } from '../use-step';

const LEVEL_COLORS: Record<PaceLevel, keyof ColorTokens> = {
  ideal: 'success',
  ambitious: 'warning',
  aggressive: 'danger',
};

/** How fast to reach the target, with how demanding that is and when the target is reached. */
export function PaceStep() {
  const { t, i18n } = useTranslation();
  const { spacing } = useTheme();
  const { format } = useNumberFormat();
  const { answers, progress, next, back } = useStep('pace');
  const goal = answers.goal === 'build_muscle' ? 'build_muscle' : 'lose_fat';
  const unit = answers.weightUnit ?? 'kg';
  const weightKg = answers.weightKg ?? 72;
  const targetKg = answers.targetWeightKg ?? weightKg;
  const paceRange = PACE_RANGES[unit][goal];
  const [pace, setPace] = useState(
    answers.weeklyPaceKg === undefined ? paceRange.default : paceIn(unit, answers.weeklyPaceKg),
  );
  const paceKg = paceToKg(unit, pace);
  const level = paceLevel(goal, weightKg, paceKg);
  const date = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(
    projectedDate(weightKg, targetKg, paceKg, new Date()),
  );

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ weeklyPaceKg: paceKg })} />
      }
    >
      <Text variant="title">{t('onboarding.steps.pace.title')}</Text>
      <View style={{ gap: spacing.lg, marginTop: spacing.lg }}>
        <Text variant="display" style={styles.centered}>
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
        <Text variant="bodyStrong" color={LEVEL_COLORS[level]} style={styles.centered}>
          {t(`onboarding.pace.levels.${level}`)}
        </Text>
        <Text style={styles.centered}>
          {t('onboarding.pace.projected', {
            weight: format(weightIn(unit, targetKg), { maximumFractionDigits: 1 }),
            unit,
            date,
          })}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.centered}>
          {t('onboarding.pace.disclaimer')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    textAlign: 'center',
  },
});
