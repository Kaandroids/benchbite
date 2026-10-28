import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ageIn, MIN_AGE } from '@/body/body';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { WheelPicker } from '@/components/ui/wheel-picker';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

const THIS_YEAR = new Date().getFullYear();
// Ages from 14, so that younger people see why they cannot continue instead of picking a
// wrong year, up to 100.
const YEARS = Array.from({ length: 87 }, (_, i) => THIS_YEAR - 100 + i);
const DEFAULT_AGE = 30;

/** The birth year rather than the age, so the age stays right in the years to come. */
export function BirthYearStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('birth-year');
  const [birthYear, setBirthYear] = useState(answers.birthYear ?? THIS_YEAR - DEFAULT_AGE);
  const age = ageIn(THIS_YEAR, birthYear);
  const tooYoung = age < MIN_AGE;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button
          label={t('common.continue')}
          disabled={tooYoung}
          onPress={() => next({ birthYear })}
        />
      }
    >
      <Text variant="title">{t('onboarding.steps.birth-year.title')}</Text>
      <CenteredContent>
        <View style={[styles.center, { gap: spacing.lg }]}>
          <WheelPicker
            accessibilityLabel={t('onboarding.steps.birth-year.title')}
            values={YEARS}
            value={birthYear}
            onChange={setBirthYear}
            width={180}
          />
          <Text color={tooYoung ? 'danger' : 'textMuted'} align="center">
            {tooYoung
              ? t('onboarding.birthYear.tooYoung')
              : t('onboarding.birthYear.age', { count: age })}
          </Text>
        </View>
      </CenteredContent>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
});
