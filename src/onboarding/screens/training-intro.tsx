import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Caption } from '@/components/ui/caption';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { stepsBetween } from '../steps';
import { useStep } from '../use-step';
import { CenteredContent } from './centered-content';

/** The turn from body data to training: half of the onboarding is done, and how much is left. */
export function TrainingIntroStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('training-intro');
  const name = answers.displayName;
  // The training questions: the steps of the flow between this one and building the plan.
  const questions = stepsBetween('training-intro', 'building', answers).length;

  return (
    <Screen
      progress={progress}
      onBack={back}
      footer={<Button label={t('common.continue')} onPress={() => next()} />}
    >
      <CenteredContent>
        <View style={{ gap: spacing.xxl }}>
          <Halfway />
          <View style={{ gap: spacing.sm }}>
            <Animated.View entering={FadeInDown.delay(500).duration(400)}>
              <Caption color="primaryText">{t('onboarding.trainingIntro.halfway')}</Caption>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(600).duration(400)}>
              <Text variant="title" accessibilityRole="header">
                {name
                  ? t('onboarding.trainingIntro.titleNamed', { name })
                  : t('onboarding.steps.training-intro.title')}
              </Text>
            </Animated.View>
            <Animated.View entering={FadeInDown.delay(700).duration(400)}>
              <Text color="textMuted">
                {t('onboarding.trainingIntro.body', { count: questions })}
              </Text>
            </Animated.View>
          </View>
        </View>
      </CenteredContent>
    </Screen>
  );
}

/** The two parts of the onboarding: the first done, the line to the second filling, the second next. */
function Halfway() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const line = useSharedValue(0);

  useEffect(() => {
    line.set(withDelay(300, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) })));
  }, [line]);

  const lineStyle = useAnimatedStyle(() => ({ width: `${line.get() * 100}%` }));

  return (
    <View
      accessible
      accessibilityLabel={t('onboarding.trainingIntro.progress')}
      style={[styles.row, { gap: spacing.sm }]}
    >
      <Part label={t('onboarding.trainingIntro.aboutYou')} icon="check" state="done" />
      <View style={[styles.track, { backgroundColor: colors.track }]}>
        <Animated.View style={[styles.fill, { backgroundColor: colors.primary }, lineStyle]} />
      </View>
      <Part label={t('onboarding.trainingIntro.yourTraining')} icon="dumbbell" state="next" />
    </View>
  );
}

type PartProps = {
  label: string;
  icon: IconName;
  /** A done part is filled in; the next one pulses. */
  state: 'done' | 'next';
};

function Part({ label, icon, state }: PartProps) {
  const { colors, spacing } = useTheme();
  const done = state === 'done';
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state === 'next') {
      pulse.set(
        withDelay(
          800,
          withRepeat(
            withSequence(withTiming(1.12, { duration: 600 }), withTiming(1, { duration: 600 })),
            -1,
          ),
        ),
      );
    }
  }, [state, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.get() }] }));
  return (
    <View style={[styles.part, { gap: spacing.sm }]}>
      <Animated.View
        entering={done ? ZoomIn.duration(400) : undefined}
        style={[
          styles.circle,
          done
            ? { backgroundColor: colors.primary }
            : { borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.surface },
          pulseStyle,
        ]}
      >
        <Icon name={icon} size={24} color={done ? 'onPrimary' : 'primary'} />
      </Animated.View>
      <Text variant="captionStrong" color={done ? 'text' : 'primaryText'} align="center">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  part: {
    width: 104,
    alignItems: 'center',
  },
  circle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // In line with the middle of the circles.
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    marginTop: 25,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
