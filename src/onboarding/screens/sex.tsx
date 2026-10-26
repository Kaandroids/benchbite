import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { StepHeading } from '../step-heading';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type Sex = NonNullable<OnboardingAnswers['sex']>;

/** The two answers shown side by side; "prefer not to say" goes under them. */
const PAIR: { sex: Sex; icon: IconName }[] = [
  { sex: 'female', icon: 'woman' },
  { sex: 'male', icon: 'man' },
];

/**
 * Sex, which the calorie calculation needs, with a card on why it is asked; "prefer not to say"
 * uses an average. Choosing saves the answer, and Continue moves on.
 */
export function SexStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, select, next } = useStep('sex');

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={
        <Button label={t('common.continue')} disabled={!answers.sex} onPress={() => next()} />
      }
    >
      <StepHeading title={t('onboarding.steps.sex.title')} intro={t('onboarding.sex.intro')} />
      <View style={[styles.row, { gap: spacing.md }]}>
        {PAIR.map(({ sex, icon }) => (
          <View key={sex} style={styles.flex}>
            <ChoiceCard
              icon={icon}
              title={t(`onboarding.options.sex.${sex}`)}
              selected={answers.sex === sex}
              onPress={() => select({ sex })}
              size="tile"
            />
          </View>
        ))}
      </View>
      <ChoiceCard
        icon="notSaid"
        title={t('onboarding.options.sex.unspecified')}
        description={t('onboarding.sex.unspecified')}
        selected={answers.sex === 'unspecified'}
        onPress={() => select({ sex: 'unspecified' })}
        size="compact"
      />
      <Card style={{ gap: spacing.sm, marginTop: spacing.xs }}>
        <Caption>{t('onboarding.sex.why')}</Caption>
        <Reason icon="flame" text={t('onboarding.sex.burn')} />
        <Reason icon="check" text={t('onboarding.sex.only')} />
      </Card>
    </Screen>
  );
}

/** One reason, with its icon. */
function Reason({ icon, text }: { icon: IconName; text: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.reason, { gap: spacing.sm }]}>
      <Icon name={icon} size={16} color="textMuted" />
      <Text variant="caption" color="textMuted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  reason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
