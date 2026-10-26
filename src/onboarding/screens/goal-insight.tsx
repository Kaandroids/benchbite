import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { AccentTitle } from '../accent-title';
import { GoalScene } from '../goal-scene';
import { Stage } from '../stage';
import type { Goal } from '../types';
import { useStep } from '../use-step';

/** The tips of each goal, in order, with their icons. */
const TIPS = {
  lose_fat: [
    { key: 'onboarding.goalInsight.lose_fat.tips.trend', icon: 'chart' },
    { key: 'onboarding.goalInsight.lose_fat.tips.time', icon: 'timer' },
    { key: 'onboarding.goalInsight.lose_fat.tips.weighIn', icon: 'target' },
  ],
  build_muscle: [
    { key: 'onboarding.goalInsight.build_muscle.tips.sleep', icon: 'moon' },
    { key: 'onboarding.goalInsight.build_muscle.tips.more', icon: 'trend' },
    { key: 'onboarding.goalInsight.build_muscle.tips.time', icon: 'timer' },
  ],
  get_stronger: [
    { key: 'onboarding.goalInsight.get_stronger.tips.steps', icon: 'trend' },
    { key: 'onboarding.goalInsight.get_stronger.tips.lighter', icon: 'snowflake' },
    { key: 'onboarding.goalInsight.get_stronger.tips.records', icon: 'trophy' },
  ],
  stay_healthy: [
    { key: 'onboarding.goalInsight.stay_healthy.tips.enough', icon: 'dumbbell' },
    { key: 'onboarding.goalInsight.stay_healthy.tips.moved', icon: 'arrow' },
    { key: 'onboarding.goalInsight.stay_healthy.tips.habits', icon: 'heart' },
  ],
} as const satisfies Record<Goal, readonly { key: string; icon: IconName }[]>;
/** When the title shows, after the scene has started; each tip follows a moment later. */
const TITLE_MS = 400;
const TIP_MS = 150;

/**
 * What the chosen goal looks like in the app, as a scene on a tinted stage like the welcome's, and
 * what to expect along the way. What the goal sets in the plan is on the goal step already.
 */
export function GoalInsightStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('goal-insight');
  const goal = answers.goal ?? 'stay_healthy';
  const name = answers.displayName;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <View style={[styles.flex, { gap: spacing.xl }]}>
        <Stage>
          <GoalScene goal={goal} />
        </Stage>
        <Animated.View entering={FadeInDown.delay(TITLE_MS).duration(400)}>
          <AccentTitle>
            {name
              ? t(`onboarding.goalInsight.${goal}.titleNamed`, { name })
              : t(`onboarding.goalInsight.${goal}.title`)}
          </AccentTitle>
        </Animated.View>
        <View style={{ gap: spacing.sm }}>
          {TIPS[goal].map(({ key, icon }, index) => (
            <Animated.View
              key={key}
              entering={FadeInDown.delay(TITLE_MS + TIP_MS * (index + 1)).duration(400)}
              style={[styles.tip, { gap: spacing.md }]}
            >
              <IconTile name={icon} size={28} />
              <Text variant="caption" color="textMuted" style={styles.flex}>
                <Trans i18nKey={key} components={{ strong: <Text variant="captionStrong" /> }} />
              </Text>
            </Animated.View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
