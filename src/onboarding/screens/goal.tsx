import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceCard } from '@/components/ui/choice-card';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useUpperCase } from '@/i18n/case';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { GOAL_ICONS } from '../goal-icons';
import type { Goal } from '../types';
import { useStep } from '../use-step';

/** What a goal sets in the plan, one row each. */
const EFFECTS: { key: 'calories' | 'training' | 'progress'; icon: IconName }[] = [
  { key: 'calories', icon: 'flame' },
  { key: 'training', icon: 'dumbbell' },
  { key: 'progress', icon: 'trend' },
];

/**
 * The main goal, which decides both the training scheme and the calorie direction. Choosing one
 * shows what it sets in the plan, and Continue moves on, so the choice can be compared first.
 */
export function GoalStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, answer, next } = useStep('goal');
  const goal = answers.goal;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} disabled={!goal} onPress={() => next()} />}
    >
      <Text variant="title" accessibilityRole="header">
        {t('onboarding.steps.goal.title')}
      </Text>
      {Constants.public.Enums.goal_kind.map((option) => (
        <ChoiceCard
          key={option}
          icon={GOAL_ICONS[option]}
          title={t(`onboarding.options.goal.${option}`)}
          description={t(`onboarding.goal.descriptions.${option}`)}
          selected={goal === option}
          onPress={() => {
            // The chosen goal is saved already.
            if (goal !== option) answer({ goal: option });
          }}
          compact
        />
      ))}
      <View style={[styles.flex, { marginTop: spacing.sm }]}>
        <GoalEffects goal={goal} />
      </View>
    </Screen>
  );
}

/** What the chosen goal sets in the plan, changing with the choice; a hint before there is one. */
function GoalEffects({ goal }: { goal: Goal | undefined }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const upperCase = useUpperCase();
  return (
    <Card style={{ gap: spacing.md }}>
      <Text variant="captionStrong" color="textMuted">
        {upperCase(t('onboarding.goal.effects.title'))}
      </Text>
      {goal ? (
        // Keyed by the goal, so the rows fade in again when it changes.
        <Animated.View
          key={goal}
          entering={FadeIn.duration(250)}
          accessibilityLiveRegion="polite"
          style={{ gap: spacing.md }}
        >
          {EFFECTS.map(({ key, icon }) => (
            <View key={key} style={[styles.row, { gap: spacing.md }]}>
              <IconTile name={icon} size={36} />
              <View style={styles.flex}>
                <Text variant="caption" color="textMuted">
                  {t(`onboarding.goal.effects.${key}`)}
                </Text>
                <Text variant="bodyStrong">{t(`onboarding.goal.effects.${goal}.${key}`)}</Text>
              </View>
            </View>
          ))}
        </Animated.View>
      ) : (
        <Text color="textMuted">{t('onboarding.goal.effects.empty')}</Text>
      )}
    </Card>
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
