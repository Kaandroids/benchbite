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
import { findExercise, useExerciseLibrary } from '@/exercises/library';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { useSetupExamples } from '../setup-examples';
import { StepHeading } from '../step-heading';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

const ICONS: Record<NonNullable<OnboardingAnswers['setup']>, IconName> = {
  gym: 'gym',
  dumbbells: 'home',
  bodyweight: 'person',
};

/**
 * Where the user trains, and a card with the first exercises the plan gives there. The
 * descriptions say what the plan builder assumes for each setup, such as dumbbells without a
 * bench. Choosing saves the answer, and Continue moves on.
 */
export function SetupStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, answer, next } = useStep('setup');
  const setup = answers.setup;
  const examples = useSetupExamples(answers, setup);
  const library = useExerciseLibrary();
  const names = examples.flatMap((id) => findExercise(library.data, id)?.name ?? []);

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
          onPress={() => {
            if (setup !== option) answer({ setup: option });
          }}
          size="compact"
        />
      ))}
      {names.length > 0 ? (
        <Card style={{ gap: spacing.sm, marginTop: spacing.xs }}>
          <Caption>{t('onboarding.setup.examples')}</Caption>
          {/* Keyed by the setup, so the list fades in anew when it changes. */}
          <Animated.View
            key={setup}
            entering={FadeIn.duration(250)}
            accessibilityLiveRegion="polite"
            style={{ gap: spacing.sm }}
          >
            {names.map((name) => (
              <View key={name} style={[styles.row, { gap: spacing.md }]}>
                <IconTile name="dumbbell" size={32} />
                <Text variant="bodyStrong" style={styles.flex}>
                  {name}
                </Text>
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
