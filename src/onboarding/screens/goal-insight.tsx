import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { GOAL_ICONS } from '../goal-icons';
import { useStep } from '../use-step';

/** A short, encouraging explanation of what the chosen goal takes. */
export function GoalInsightStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('goal-insight');
  const goal = answers.goal ?? 'stay_healthy';

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <View style={[styles.content, { gap: spacing.lg }]}>
        <Animated.View entering={ZoomIn.duration(400)}>
          <IconTile name={GOAL_ICONS[goal]} size={88} />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(150).duration(400)} style={{ gap: spacing.md }}>
          <Text variant="title" align="center">
            {t(`onboarding.goalInsight.${goal}.title`)}
          </Text>
          <Text color="textMuted" align="center">
            {t(`onboarding.goalInsight.${goal}.body`)}
          </Text>
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
