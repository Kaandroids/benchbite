import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ChoiceCard } from '@/components/ui/choice-card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Constants } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { GOAL_ICONS } from '../goal-icons';
import { useStep } from '../use-step';

/** Delay between the tiles appearing. */
const STEP_MS = 80;

/**
 * The main goal, which decides both the training scheme and the calorie direction: four large
 * tiles in a grid, as it shapes the whole plan.
 */
export function GoalStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, choose } = useStep('goal');
  const name = answers.displayName;

  return (
    <Screen progress={progress} onBack={back}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {name ? t('onboarding.goal.titleNamed', { name }) : t('onboarding.steps.goal.title')}
        </Text>
        <Text color="textMuted">{t('onboarding.goal.subtitle')}</Text>
      </View>
      <View style={[styles.grid, { gap: spacing.md }]}>
        {Constants.public.Enums.goal_kind.map((goal, index) => (
          <Animated.View
            key={goal}
            entering={FadeInDown.delay(STEP_MS * index).duration(350)}
            style={styles.cell}
          >
            <ChoiceCard
              layout="tile"
              icon={GOAL_ICONS[goal]}
              title={t(`onboarding.options.goal.${goal}`)}
              description={t(`onboarding.goal.descriptions.${goal}`)}
              selected={answers.goal === goal}
              onPress={() => choose({ goal })}
              style={styles.flex}
            />
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Two to a row: half the width less half the gap.
  cell: {
    flexBasis: '46%',
    flexGrow: 1,
  },
  flex: {
    flex: 1,
  },
});
