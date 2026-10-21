import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import {
  defaultUnits,
  feetAndInchesToCm,
  heightToFeetAndInches,
  type HeightUnit,
} from '@/i18n/units';
import { useTheme } from '@/theme';

import { HEIGHT_RANGE_CM } from '../body';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const CENTIMETRES = range(HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max);
const FEET = range(3, 8);
const INCHES = range(0, 11);

/** A typical height to start the wheel from, so most people only scroll a little. */
const DEFAULT_HEIGHT_CM: Record<NonNullable<OnboardingAnswers['sex']>, number> = {
  female: 165,
  male: 178,
  unspecified: 172,
};

const clamp = (cm: number) => Math.min(HEIGHT_RANGE_CM.max, Math.max(HEIGHT_RANGE_CM.min, cm));

/** The height in centimetres or in feet and inches; it is stored in centimetres either way. */
export function HeightStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('height');
  const [unit, setUnit] = useState<HeightUnit>(answers.heightUnit ?? defaultUnits().height);
  const [heightCm, setHeightCm] = useState(
    answers.heightCm ?? DEFAULT_HEIGHT_CM[answers.sex ?? 'unspecified'],
  );
  const { feet, inches } = heightToFeetAndInches(heightCm);

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button label={t('common.continue')} onPress={() => next({ heightCm, heightUnit: unit })} />
      }
    >
      <Text variant="title">{t('onboarding.steps.height.title')}</Text>
      <SegmentedControl
        accessibilityLabel={t('onboarding.steps.height.title')}
        options={[
          { value: 'cm', label: t('onboarding.units.cm') },
          { value: 'ft', label: t('onboarding.units.ftIn') },
        ]}
        value={unit}
        onChange={setUnit}
      />
      {/* Each wheel has its own key, so switching units mounts fresh wheels instead of reusing
          one whose scroll position belongs to the other unit. */}
      <View style={[styles.row, { gap: spacing.xs, marginTop: spacing.lg }]}>
        {unit === 'cm' ? (
          <>
            <WheelPicker
              key="cm"
              accessibilityLabel={t('onboarding.steps.height.title')}
              values={CENTIMETRES}
              value={Math.round(heightCm)}
              onChange={setHeightCm}
              formatAccessibilityValue={(cm) => `${cm} cm`}
            />
            <Text variant="headline" color="textMuted">
              {t('onboarding.units.cm')}
            </Text>
          </>
        ) : (
          <>
            <WheelPicker
              key="feet"
              accessibilityLabel={t('onboarding.steps.height.title')}
              values={FEET}
              value={feet}
              onChange={(newFeet) => setHeightCm(clamp(feetAndInchesToCm(newFeet, inches)))}
              format={(newFeet) => t('onboarding.units.feet', { count: newFeet })}
            />
            <WheelPicker
              key="inches"
              accessibilityLabel={t('onboarding.steps.height.title')}
              values={INCHES}
              value={inches}
              onChange={(newInches) => setHeightCm(clamp(feetAndInchesToCm(feet, newInches)))}
              format={(newInches) => t('onboarding.units.inches', { count: newInches })}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
