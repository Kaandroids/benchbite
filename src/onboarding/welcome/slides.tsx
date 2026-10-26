import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUpperCase } from '@/i18n/case';
import { useWeekdayFormat } from '@/i18n/dates';
import { defaultUnits, useNumberFormat } from '@/i18n/units';
import { StreakBadge } from '@/streak/streak-badge';
import { useTheme } from '@/theme';

// Example data that shows what the app does; none of it is the user's.
const TRAINING_DAYS = [1, 3, 5];
const SETS_KG = [
  { kg: 60, lb: 135, reps: 10 },
  { kg: 62.5, lb: 140, reps: 8 },
  { kg: 65, lb: 145, reps: 6 },
];
const EATEN_KCAL = 920;
const TARGET_KCAL = 1390;
const MACRO_SHARES = { protein: 0.7, carbs: 0.5, fat: 0.4 } as const;

/** Delay between the parts of an illustration appearing. */
const STEP_MS = 180;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

export type SlideKey = 'plan' | 'sets' | 'food' | 'progress';

/** The welcome's slides in order: what the app does, one thing at a time. */
export const SLIDES: { key: SlideKey; Illustration: () => ReactNode }[] = [
  { key: 'plan', Illustration: PlanIllustration },
  { key: 'sets', Illustration: SetsIllustration },
  { key: 'food', Illustration: FoodIllustration },
  { key: 'progress', Illustration: ProgressIllustration },
];

/** A week with the training days filling in, and today's workout. */
function PlanIllustration() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekday = useWeekdayFormat('narrow');
  const upperCase = useUpperCase();
  return (
    <Card>
      <Text variant="captionStrong" color="textMuted">
        {upperCase(t('onboarding.welcome.slides.plan.week'))}
      </Text>
      <View style={styles.week}>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
          <View key={day} style={[styles.day, { gap: spacing.xs }]}>
            <Text variant="captionStrong" color="textMuted">
              {weekday(day)}
            </Text>
            <View style={[styles.dot, { backgroundColor: colors.track }]}>
              {TRAINING_DAYS.includes(day) ? (
                <Animated.View
                  entering={ZoomIn.delay(STEP_MS * (TRAINING_DAYS.indexOf(day) + 1))}
                  style={[
                    StyleSheet.absoluteFill,
                    styles.round,
                    { backgroundColor: colors.primary },
                  ]}
                />
              ) : null}
            </View>
          </View>
        ))}
      </View>
      <Animated.View
        entering={FadeInDown.delay(STEP_MS * 5)}
        style={{
          borderRadius: radii.md,
          backgroundColor: colors.selected,
          padding: spacing.md,
        }}
      >
        <Text variant="captionStrong" color="primaryText">
          {upperCase(t('onboarding.welcome.slides.plan.today'))}
        </Text>
        <Text variant="label">
          {t('onboarding.welcome.slides.plan.workout', {
            workout: t('workout.sessionTypes.upper'),
            minutes: 45,
          })}
        </Text>
      </Animated.View>
    </Card>
  );
}

/** A workout's sets being ticked off, ending in a new record. */
function SetsIllustration() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const unit = defaultUnits().weight;
  return (
    <View>
      <Card>
        <Text variant="label">{t('onboarding.welcome.slides.sets.exercise')}</Text>
        {SETS_KG.map((set, index) => (
          <Animated.View
            key={index}
            entering={FadeInDown.delay(STEP_MS * index)}
            style={[
              styles.set,
              {
                gap: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.background,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <Text variant="captionStrong" color="textMuted">
              {index + 1}
            </Text>
            <Text variant="bodyStrong" style={styles.flex}>
              {`${format(unit === 'lb' ? set.lb : set.kg)} ${unit} × ${set.reps}`}
            </Text>
            <Animated.View
              entering={ZoomIn.delay(STEP_MS * (index + 2))}
              style={[styles.tick, { backgroundColor: colors.primary }]}
            >
              <Icon name="check" size={14} color="onPrimary" />
            </Animated.View>
          </Animated.View>
        ))}
      </Card>
      <Animated.View
        entering={ZoomIn.delay(STEP_MS * 6)}
        style={[
          styles.record,
          {
            gap: spacing.xs,
            borderRadius: radii.md,
            backgroundColor: colors.inverseSurface,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <Icon name="trophy" size={16} color="primary" />
        <Text variant="captionStrong" color="onInverse">
          {t('onboarding.welcome.slides.sets.record')}
        </Text>
      </Animated.View>
    </View>
  );
}

/** A day's calories filling up, with the macros beside them. */
function FoodIllustration() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const ring = useDrawn(STEP_MS);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - (EATEN_KCAL / TARGET_KCAL) * ring.get()),
  }));
  return (
    <Card style={[styles.row, { gap: spacing.lg }]}>
      <View style={styles.ring}>
        <Svg width={110} height={110} viewBox="0 0 110 110">
          <Circle cx={55} cy={55} r={radius} fill="none" stroke={colors.track} strokeWidth={12} />
          <AnimatedCircle
            animatedProps={ringProps}
            cx={55}
            cy={55}
            r={radius}
            fill="none"
            stroke={colors.primary}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            transform="rotate(-90 55 55)"
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text variant="label">{format(EATEN_KCAL)}</Text>
          <Text variant="caption" color="textMuted">
            {t('onboarding.welcome.slides.food.of', { total: format(TARGET_KCAL) })}
          </Text>
        </View>
      </View>
      <View style={[styles.flex, { gap: spacing.sm }]}>
        {(Object.keys(MACRO_SHARES) as (keyof typeof MACRO_SHARES)[]).map((macro, index) => (
          <View key={macro} style={{ gap: spacing.xs }}>
            <Text variant="captionStrong" color="textMuted">
              {t(`nutrition.macros.${macro}`)}
            </Text>
            <View style={[styles.bar, { backgroundColor: colors.track }]}>
              <Animated.View
                entering={FadeInDown.delay(STEP_MS * (index + 2))}
                style={[
                  styles.bar,
                  { width: `${MACRO_SHARES[macro] * 100}%`, backgroundColor: colors[macro] },
                ]}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

/** The weight going down over the weeks, a streak and the days trained. */
function ProgressIllustration() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const upperCase = useUpperCase();
  const line = useDrawn(STEP_MS);
  const length = 320;
  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: length * (1 - line.get()) }));
  return (
    <Card>
      <View style={[styles.row, styles.between]}>
        <Text variant="captionStrong" color="textMuted" style={styles.flex}>
          {upperCase(t('onboarding.welcome.slides.progress.weight'))}
        </Text>
        <Animated.View entering={ZoomIn.delay(STEP_MS * 6)}>
          <StreakBadge streak={{ count: 12, doneToday: true, days: {} }} />
        </Animated.View>
      </View>
      <Svg width="100%" height={110} viewBox="0 0 300 110" preserveAspectRatio="none">
        <Path d="M0 104 H300" stroke={colors.track} strokeWidth={2} />
        <AnimatedPath
          animatedProps={lineProps}
          d="M8 22 C 50 26, 70 40, 100 46 S 150 54, 180 68 S 250 84, 292 88"
          fill="none"
          stroke={colors.primary}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${length} ${length}`}
        />
      </Svg>
      <View style={[styles.row, { gap: spacing.xs }]}>
        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
          <Animated.View
            key={day}
            entering={ZoomIn.delay(STEP_MS * 2 + day * 60)}
            style={[styles.done, { backgroundColor: day === 5 ? colors.track : colors.primary }]}
          />
        ))}
      </View>
    </Card>
  );
}

/** Goes from 0 to 1 after a delay, for a line or a ring that draws itself. */
function useDrawn(delay: number) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(
      withDelay(delay, withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) })),
    );
  }, [delay, progress]);
  return progress;
}

const styles = StyleSheet.create({
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  day: {
    alignItems: 'center',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  round: {
    borderRadius: 16,
  },
  set: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  record: {
    position: 'absolute',
    right: -8,
    top: -16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  ring: {
    width: 110,
    height: 110,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
  done: {
    flex: 1,
    height: 8,
    borderRadius: 4,
  },
  flex: {
    flex: 1,
  },
});
