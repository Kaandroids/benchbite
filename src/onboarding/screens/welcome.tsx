import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';

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
/** The stage's tint: the primary colour at about 10 % opacity, as a hex alpha. */
const STAGE_TINT = '1A';

/**
 * The first screen: what the app does, as slides to tap or swipe through like stories, then on to
 * the questions.
 */
export function WelcomeStep() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { next } = useStep('welcome');
  const isAccount = useIsAccount();
  const stories = useStories(SLIDES.length);
  const [width, setWidth] = useState(0);
  const slide = SLIDES[stories.index]!;
  const titleStart = t(`onboarding.welcome.slides.${slide.key}.title`);
  const titleAccent = t(`onboarding.welcome.slides.${slide.key}.accent`);
  const body = t(`onboarding.welcome.slides.${slide.key}.body`);
  // The new slide comes in from the side it was reached from, as when swiping.
  const SlideIn = stories.direction === 'back' ? FadeInLeft : FadeInRight;

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
    <Screen
      scrolls={false}
      footer={
        <View style={{ gap: spacing.lg }}>
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
      }
    >
      <View style={[styles.flex, { paddingHorizontal: spacing.xl, gap: spacing.md }]}>
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
            accessibilityLabel={`${titleStart} ${titleAccent}. ${body}`}
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
            style={[styles.flex, { gap: spacing.xl }]}
          >
            {/* A tinted stage of fixed size for the picture, so the words below stay in one place
                from slide to slide. Keyed by the slide, so its picture plays again whenever it
                shows. */}
            <View
              style={[
                styles.stage,
                {
                  borderRadius: radii.xl,
                  // A faint wash of the brand colour, under the cards in both themes.
                  backgroundColor: `${colors.primary}${STAGE_TINT}`,
                  padding: spacing.lg,
                },
              ]}
            >
              <Animated.View key={slide.key} entering={SlideIn.duration(300)}>
                <slide.Illustration />
              </Animated.View>
            </View>
            <Animated.View
              key={`${slide.key}-text`}
              entering={FadeIn.duration(300)}
              style={[styles.words, { gap: spacing.sm }]}
            >
              {/* Centred, with the point of the slide in the brand orange. */}
              <Text style={styles.title} align="center" accessibilityRole="header">
                {titleStart}{' '}
                <Text style={[styles.title, { color: colors.primaryText }]}>{titleAccent}</Text>
              </Text>
              <Text color="textMuted" align="center" style={styles.body}>
                {body}
              </Text>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  // Centred, like everything under it.
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: fonts.black,
    fontSize: 20,
  },
  stage: {
    flex: 1,
    justifyContent: 'center',
  },
  // Room for a two-line title and a two-line text, the same on every slide.
  words: {
    minHeight: 140,
  },
  title: {
    fontFamily: fonts.black,
    fontSize: 32,
    lineHeight: 38,
  },
  body: {
    fontFamily: fonts.medium,
    fontSize: 17,
    lineHeight: 24,
  },
});
