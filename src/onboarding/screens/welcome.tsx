import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';

import { BrandMark } from '@/brand/brand-mark';
import { Wordmark } from '@/brand/wordmark';
import { Button } from '@/components/ui/button';
import { LinkPrompt } from '@/components/ui/link-prompt';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useIsAccount } from '@/providers/session-provider';
import { useTheme } from '@/theme';

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
  const { colors, radii, spacing } = useTheme();
  const { next } = useStep('welcome');
  const isAccount = useIsAccount();
  const stories = useStories(SLIDES.length);
  const [width, setWidth] = useState(0);
  const slide = SLIDES[stories.index]!;
  const titleKey = `onboarding.welcome.slides.${slide.key}.title` as const;
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
          <Wordmark size={20} color={colors.primaryText} />
        </View>
        <GestureDetector gesture={gesture}>
          <View
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`${plainText(t(titleKey))}. ${body}`}
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
                  backgroundColor: colors.primaryWash,
                  padding: spacing.lg,
                },
              ]}
            >
              <FitInside>
                <Animated.View key={slide.key} entering={SlideIn.duration(300)}>
                  <slide.Illustration />
                </Animated.View>
              </FitInside>
            </View>
            <Animated.View
              key={`${slide.key}-text`}
              entering={FadeIn.duration(300)}
              style={[styles.words, { gap: spacing.sm }]}
            >
              {/* Centred, with the point of the slide in the brand orange. */}
              <Text variant="hero" align="center" accessibilityRole="header">
                <Trans
                  i18nKey={titleKey}
                  components={{ accent: <Text variant="hero" color="primaryText" /> }}
                />
              </Text>
              <Text variant="lead" color="textMuted" align="center">
                {body}
              </Text>
            </Animated.View>
          </View>
        </GestureDetector>
      </View>
    </Screen>
  );
}

/**
 * Shrinks its content to fit the space it is given, never growing it: on a small screen, or with
 * a large font, a picture taller than the stage stays inside it.
 */
function FitInside({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState(0);
  const [content, setContent] = useState(0);
  const scale = space > 0 && content > space ? space / content : 1;
  return (
    <View
      onLayout={(event) => setSpace(event.nativeEvent.layout.height)}
      style={[styles.flex, styles.fit]}
    >
      <View
        onLayout={(event) => setContent(event.nativeEvent.layout.height)}
        style={{ transform: [{ scale }] }}
      >
        {children}
      </View>
    </View>
  );
}

/** A translation without its markup, for screen readers. */
function plainText(text: string) {
  return text.replace(/<\/?\w+>/g, '');
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
  stage: {
    flex: 1,
    overflow: 'hidden',
  },
  fit: {
    justifyContent: 'center',
  },
  // Room for a one-line title and a two-line text, the same on every slide, so the words stay in
  // one place without leaving a gap above the button. A longer title only makes the stage smaller.
  words: {
    minHeight: 104,
  },
});
