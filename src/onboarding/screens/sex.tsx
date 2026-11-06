import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { StepHeading } from '@/components/ui/step-heading';
import { Text } from '@/components/ui/text';
import { useTheme, type Tone } from '@/theme';

import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type Sex = NonNullable<OnboardingAnswers['sex']>;

/** The two answers shown side by side; "prefer not to say" goes under them. */
const PAIR: { sex: Sex; icon: IconName; tone: Tone }[] = [
  { sex: 'female', icon: 'woman', tone: 'snack' },
  { sex: 'male', icon: 'man', tone: 'dinner' },
];

/**
 * Sex, which the calorie calculation needs, with a card on why it is asked; "prefer not to say"
 * uses an average. Choosing saves the answer, and Continue moves on.
 */
export function SexStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, select, next, bar } = useStep('sex');

  return (
    <Screen
      {...bar}
      footer={
        <Button label={t('common.continue')} disabled={!answers.sex} onPress={() => next()} />
      }
    >
      <StepHeading title={t('onboarding.steps.sex.title')} intro={t('onboarding.sex.intro')} />
      <View style={[styles.row, { gap: spacing.md }]}>
        {PAIR.map(({ sex, icon, tone }) => (
          <View key={sex} style={styles.flex}>
            <ChoiceCard
              icon={icon}
              tone={tone}
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
        tone="water"
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

/** One reason, its icon on a tile like the points of other steps, grey as it only informs. */
function Reason({ icon, text }: { icon: IconName; text: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.reason, { gap: spacing.md }]}>
      <IconTile name={icon} size={36} color="textMuted" background="track" />
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
    alignItems: 'center',
  },
});
