import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Rect } from 'react-native-svg';

import { PlateCuts } from '@/brand/bitten-plate';
import { MARK_BOX, PLATE } from '@/brand/mark';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { stepsBetween } from '../steps';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

const SIZE = 180;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/**
 * The turn from body data to training: the Benchbite plate filled to half, as the building step
 * fills it the rest of the way, and how many questions are left.
 */
export function TrainingIntroStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back, close } = useStep('training-intro');
  const name = answers.displayName;
  // The training questions: the steps of the flow between this one and building the plan.
  const questions = stepsBetween('training-intro', 'building', answers).length;

  return (
    <Screen
      progress={progress}
      onBack={back}
      onClose={close}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <CenteredContent>
        <View style={[styles.center, { gap: spacing.xl }]}>
          <HalfPlate />
          <Animated.View
            entering={FadeInDown.delay(700).duration(400)}
            style={[styles.center, { gap: spacing.sm }]}
          >
            <Text variant="hero" align="center" accessibilityRole="header">
              {name
                ? t('onboarding.trainingIntro.titleNamed', { name })
                : t('onboarding.steps.training-intro.title')}
            </Text>
            <Text color="textMuted" align="center">
              {t('onboarding.trainingIntro.body', { count: questions })}
            </Text>
          </Animated.View>
        </View>
      </CenteredContent>
    </Screen>
  );
}

/** The plate, filling up from the bottom to half, like a glass. */
function HalfPlate() {
  const { colors } = useTheme();
  const level = useSharedValue(0);
  useEffect(() => {
    level.set(withDelay(200, withTiming(0.5, { duration: 900, easing: Easing.out(Easing.cubic) })));
  }, [level]);
  // The fill rises from the plate's bottom edge.
  const bottom = PLATE.cy + PLATE.r;
  const fillProps = useAnimatedProps(() => {
    const height = PLATE.r * 2 * level.get();
    return { y: bottom - height, height };
  });
  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`} accessible={false}>
      <Defs>
        <ClipPath id="training-intro-plate">
          <Circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} />
        </ClipPath>
      </Defs>
      <Circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} fill={colors.track} />
      <AnimatedRect
        animatedProps={fillProps}
        x={PLATE.cx - PLATE.r}
        width={PLATE.r * 2}
        fill={colors.primary}
        clipPath="url(#training-intro-plate)"
      />
      <PlateCuts background={colors.background} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
});
