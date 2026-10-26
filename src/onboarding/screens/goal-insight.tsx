import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { GoalChart } from '../goal-chart';
import { useStep } from '../use-step';

/** The points of a goal, in order. */
const POINTS = ['first', 'second', 'third'] as const;
/** Delay between the parts of the screen appearing. */
const STEP_MS = 150;

/** What the chosen goal takes: a chart of it over time and the three things the plan does. */
export function GoalInsightStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { answers, progress, next, back } = useStep('goal-insight');
  const goal = answers.goal ?? 'stay_healthy';
  const name = answers.displayName;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <GoalChart goal={goal} />
      <Animated.View entering={FadeInDown.delay(STEP_MS).duration(400)} style={{ gap: spacing.xs }}>
        <Text variant="title" accessibilityRole="header">
          {name
            ? t(`onboarding.goalInsight.${goal}.titleNamed`, { name })
            : t(`onboarding.goalInsight.${goal}.title`)}
        </Text>
        <Text color="textMuted">{t('onboarding.goalInsight.how')}</Text>
      </Animated.View>
      <View style={{ gap: spacing.lg }}>
        {POINTS.map((point, index) => (
          <Animated.View
            key={point}
            entering={FadeInDown.delay(STEP_MS * (index + 2)).duration(400)}
            style={[styles.point, { gap: spacing.md }]}
          >
            <View style={[styles.tick, { backgroundColor: colors.primary }]}>
              <Icon name="check" size={16} color="onPrimary" />
            </View>
            <View style={styles.flex}>
              <Text variant="label">{t(`onboarding.goalInsight.${goal}.${point}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`onboarding.goalInsight.${goal}.${point}.body`)}
              </Text>
            </View>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  point: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  tick: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
