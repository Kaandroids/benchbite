import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import type { IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { StepHeading } from '../step-heading';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const ICONS: Record<NonNullable<OnboardingAnswers['setup']>, IconName> = {
  gym: 'gym',
  dumbbells: 'home',
  bodyweight: 'person',
};

/** What a setup means for the plan, one row each. */
const FACTS: { key: 'need' | 'exercises' | 'progress'; icon: IconName }[] = [
  { key: 'need', icon: 'dumbbell' },
  { key: 'exercises', icon: 'layers' },
  { key: 'progress', icon: 'trend' },
];

/**
 * Where the user trains, and a card on what it means: what is needed, which kinds of exercises
 * the plan uses (a setup's own equipment and less), and how to progress with it. The
 * descriptions say what the plan builder assumes for each setup, such as dumbbells without a
 * bench. Choosing saves the answer, and Continue moves on.
 */
export function SetupStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, select, next } = useStep('setup');
  const setup = answers.setup;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} disabled={!setup} onPress={() => next()} />}
    >
      <StepHeading title={t('onboarding.steps.setup.title')} intro={t('onboarding.setup.intro')} />
      {Constants.public.Enums.training_setup.map((option) => (
        <ChoiceCard
          key={option}
          icon={ICONS[option]}
          title={t(`onboarding.options.setup.${option}`)}
          description={t(`onboarding.setup.descriptions.${option}`)}
          selected={setup === option}
          onPress={() => select({ setup: option })}
          size="compact"
        />
      ))}
      {setup ? (
        <Card style={{ gap: spacing.md, marginTop: spacing.xs }}>
          <Caption>{t('onboarding.setup.means')}</Caption>
          {/* Keyed by the setup, so the rows fade in anew when it changes. */}
          <Animated.View
            key={setup}
            entering={FadeIn.duration(250)}
            accessibilityLiveRegion="polite"
            style={{ gap: spacing.md }}
          >
            {FACTS.map(({ key, icon }) => (
              <View key={key} style={[styles.row, { gap: spacing.md }]}>
                <IconTile name={icon} size={36} />
                <View style={styles.flex}>
                  <Text variant="caption" color="textMuted">
                    {t(`onboarding.setup.${key}`)}
                  </Text>
                  <Text variant="bodyStrong">{t(`onboarding.setup.facts.${setup}.${key}`)}</Text>
                </View>
              </View>
            ))}
          </Animated.View>
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
  flex: {
    flex: 1,
  },
});
