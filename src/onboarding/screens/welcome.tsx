import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { BrandMark } from '@/brand/brand-mark';
import { Button } from '@/components/ui/button';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useIsAccount } from '@/providers/session-provider';
import { fonts, useTheme } from '@/theme';

import { SLIDES } from '../welcome/slides';
import { StoryProgress } from '../welcome/story-progress';
import { useStories } from '../welcome/use-stories';
import { useStep } from '../use-step';

/** A tap on this share of the slide's width, from the left, goes back; the rest goes on. */
const BACK_ZONE = 0.35;

/**
 * The first screen: what the app does, as slides to tap or swipe through like stories, then on to
 * the questions.
 */
export function WelcomeStep() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { next } = useStep('welcome');
  const isAccount = useIsAccount();
  const stories = useStories(SLIDES.length);
  const [width, setWidth] = useState(0);
  const slide = SLIDES[stories.index]!;

  const gesture = Gesture.Race(
    Gesture.Fling().direction(1).runOnJS(true).onEnd(stories.previous),
    Gesture.Fling().direction(2).runOnJS(true).onEnd(stories.next),
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((event) => (event.x < width * BACK_ZONE ? stories.previous() : stories.next())),
    // Holding the slide pauses it, as with stories, to read it at leisure.
    Gesture.LongPress()
      .minDuration(250)
      .runOnJS(true)
      .onStart(stories.pause)
      .onFinalize(stories.resume),
  );

  return (
    // The footer is part of the content rather than the screen's own, so that the button lines up
    // with the slides, which use a narrower margin than other screens to give the cards room.
    <Screen scrolls={false}>
      <View style={[styles.flex, { paddingHorizontal: spacing.lg, gap: spacing.md }]}>
        <View style={{ paddingTop: spacing.md }}>
          <StoryProgress
            count={SLIDES.length}
            index={stories.index}
            autoplay={stories.autoplay}
            paused={stories.paused}
          />
        </View>
        <View style={[styles.brand, { gap: spacing.sm }]}>
          <BrandMark size={32} />
          <Text style={[styles.wordmark, { color: colors.primaryText }]}>benchbite</Text>
        </View>
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${t(`onboarding.welcome.slides.${slide.key}.title`)}. ${t(`onboarding.welcome.slides.${slide.key}.body`)}`}
            accessibilityValue={{
              text: t('onboarding.welcome.slide', {
                current: stories.index + 1,
                count: SLIDES.length,
              }),
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) =>
              event.nativeEvent.actionName === 'increment' ? stories.next() : stories.previous()
            }
            onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
            style={[styles.flex, styles.slide, { gap: spacing.xxl }]}
          >
            {/* Keyed by the slide, so its illustration plays again whenever it shows. */}
            <Animated.View key={slide.key} entering={FadeIn.duration(250)}>
              <slide.Illustration />
            </Animated.View>
            <Animated.View
              key={`${slide.key}-text`}
              entering={FadeInDown.duration(400)}
              style={{ gap: spacing.sm }}
            >
              <Text variant="title" accessibilityRole="header">
                {t(`onboarding.welcome.slides.${slide.key}.title`)}
              </Text>
              <Text color="textMuted">{t(`onboarding.welcome.slides.${slide.key}.body`)}</Text>
            </Animated.View>
          </View>
        </GestureDetector>
        <View style={{ gap: spacing.lg, paddingVertical: spacing.lg }}>
          <Text variant="caption" color="textMuted" align="center">
            {t('onboarding.welcome.free')}
          </Text>
          <Button label={t('onboarding.welcome.start')} onPress={() => next()} />
          {/* An account that logged in before finishing the onboarding has nothing to log in to. */}
          {isAccount ? null : (
            <LinkPrompt
              question={t('account.haveAccount')}
              action={t('account.logIn')}
              onPress={() => router.push('/account/login')}
            />
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontFamily: fonts.black,
    fontSize: 20,
  },
  slide: {
    justifyContent: 'center',
  },
});
