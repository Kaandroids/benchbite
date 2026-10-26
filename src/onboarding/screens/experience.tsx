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
import { prescribe } from '@shared/plan/prescription';
import { splitFor } from '@shared/plan/split';

import { StepHeading } from '../step-heading';
import { RECOMMENDED_DAYS } from '../training';
import type { OnboardingAnswers } from '../types';
import { useStep } from '../use-step';

type Experience = NonNullable<OnboardingAnswers['experience']>;

const LEVELS = Constants.public.Enums.experience;

/**
 * Experience, each level with a mark of one to three bars, and a card on what the chosen level
 * sets: the suggested week and the sets of the main lifts, from the plan builder's own rules.
 * Choosing saves the answer, and Continue moves on.
 */
export function ExperienceStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, answer, next } = useStep('experience');
  const experience = answers.experience;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} disabled={!experience} onPress={() => next()} />}
    >
      <StepHeading
        title={t('onboarding.steps.experience.title')}
        intro={t('onboarding.experience.intro')}
      />
      {LEVELS.map((level, index) => (
        <ChoiceCard
          key={level}
          title={t(`onboarding.options.experience.${level}`)}
          description={t(`onboarding.experience.descriptions.${level}`)}
          level={{ value: index + 1, of: LEVELS.length }}
          selected={experience === level}
          onPress={() => {
            if (experience !== level) answer({ experience: level });
          }}
          size="compact"
        />
      ))}
      {experience ? (
        <Card style={{ gap: spacing.md, marginTop: spacing.xs }}>
          <Caption>{t('onboarding.experience.plan')}</Caption>
          <LevelPlan experience={experience} goal={answers.goal ?? 'stay_healthy'} />
        </Card>
      ) : null}
    </Screen>
  );
}

/** The suggested week and the main lifts' sets for the level; keyed so it fades in anew. */
function LevelPlan({
  experience,
  goal,
}: {
  experience: Experience;
  goal: NonNullable<OnboardingAnswers['goal']>;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const days = RECOMMENDED_DAYS[experience].length;
  const types = [...new Set(splitFor(days, experience))]
    .map((type) => t(`workout.sessionTypes.${type}`))
    .join(', ');
  const sets = prescribe(goal, experience, 'main', ['reps']).sets;
  return (
    <Animated.View
      key={experience}
      entering={FadeIn.duration(250)}
      accessibilityLiveRegion="polite"
      style={{ gap: spacing.md }}
    >
      <Fact
        icon="calendar"
        label={t('onboarding.experience.week')}
        value={t('onboarding.experience.days', { count: days, types })}
      />
      <Fact
        icon="dumbbell"
        label={t('onboarding.experience.main')}
        value={t('onboarding.experience.sets', { count: sets })}
      />
    </Animated.View>
  );
}

/** One thing the level sets, with its icon. */
function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <IconTile name={icon} size={36} />
      <View style={styles.flex}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="bodyStrong">{value}</Text>
      </View>
    </View>
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
