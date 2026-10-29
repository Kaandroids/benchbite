import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedProps,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import { Caption } from '@/components/ui/caption';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Text } from '@/components/ui/text';
import { addDays, toIsoDate, weekStart } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { StreakBadge } from '@/streak/streak-badge';
import { WeekCard } from '@/today/week-card';
import { useTheme } from '@/theme';
import { weekSchedule } from '@/workouts/week-schedule';
import type { WeekSession } from '@/workouts/workouts';

import { EXAMPLE_STREAK, SceneNote, STEP_MS, useExampleWeight } from '../example';
import { useDrawn } from '../use-drawn';

// Example data that shows what the app does; none of it is the user's.
const EXAMPLE_SETS = [
  { kg: 60, lb: 135, reps: 10 },
  { kg: 62.5, lb: 140, reps: 8 },
  { kg: 65, lb: 145, reps: 6 },
];
const EATEN_KCAL = 920;
const TARGET_KCAL = 1390;
const RING_SIZE = 140;
// One weigh-in a week, drawn in a chart box of this size.
const WEIGH_INS_KG = [82, 81.4, 80.9, 80.1, 79.4, 78.5];
const CHART = { width: 300, height: 100 };
/** How many of the last weeks the plan slide's weight loss covers. */
const RECENT_WEEKS = 2;
const WEIGH_IN_POINTS = WEIGH_INS_KG.map((kg, index) => ({
  x: 12 + (index * (CHART.width - 24)) / (WEIGH_INS_KG.length - 1),
  y: 14 + ((82.5 - kg) / 4.5) * (CHART.height - 28),
}));
const WEIGH_IN_PATH = WEIGH_IN_POINTS.map(
  (point, index) => `${index ? 'L' : 'M'}${point.x} ${point.y}`,
).join(' ');
const WEIGH_IN_LENGTH = WEIGH_IN_POINTS.slice(1).reduce(
  (length, point, index) =>
    length + Math.hypot(point.x - WEIGH_IN_POINTS[index]!.x, point.y - WEIGH_IN_POINTS[index]!.y),
  0,
);
const EXAMPLE_MACROS = [
  { key: 'protein', eaten: 105, target: 150 },
  { key: 'carbs', eaten: 76, target: 152 },
  { key: 'fat', eaten: 16, target: 39 },
] as const;

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

/**
 * A week as Today shows it, on a Friday: workouts done, one moved and done the day after, one
 * skipped, and today's still to come. Under it, the weight lost in the last weeks.
 */
function PlanIllustration() {
  const { t } = useTranslation();
  const weight = useExampleWeight();
  const [friday] = useState(() => addDays(weekStart(new Date()), 4));
  return (
    <WeekCard
      today={friday}
      streakDays={EXAMPLE_STREAK.days}
      schedule={sampleSchedule(friday)}
      onDayPress={() => undefined}
    >
      <SceneNote icon="trend" delay={STEP_MS * 3}>
        {t('onboarding.welcome.slides.plan.lost', {
          weight: weight(WEIGH_INS_KG.at(-1 - RECENT_WEEKS)! - WEIGH_INS_KG.at(-1)!),
          count: RECENT_WEEKS,
        })}
      </SceneNote>
    </WeekCard>
  );
}

/**
 * Example workouts from Monday to Saturday: Monday done, Tuesday's moved to Wednesday and done
 * there, Thursday's skipped, Friday's today and Saturday's to come.
 */
function sampleSchedule(friday: Date) {
  const day = (weekday: number) => toIsoDate(addDays(weekStart(friday), weekday - 1));
  const session = (workoutId: number, weekday: number, type: WeekSession['type']) => ({
    workoutId,
    weekday,
    name: null,
    type,
    exercises: [],
    estimatedMinutes: 45,
  });
  return weekSchedule(
    [
      session(1, 1, 'upper'),
      session(2, 2, 'lower'),
      session(3, 4, 'full_body'),
      session(4, 5, 'upper'),
      session(5, 6, 'lower'),
    ],
    [
      { workoutId: 2, fromOn: day(2), toOn: day(3) },
      { workoutId: 3, fromOn: day(4), toOn: null },
    ],
    [
      { workoutId: 1, startedOn: day(1) },
      { workoutId: 2, startedOn: day(3) },
    ],
    friday,
  );
}

/** A workout's sets being ticked off, the last a new record. */
function SetsIllustration() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weight = useExampleWeight();
  const best = EXAMPLE_SETS.at(-1)!;
  return (
    <Card>
      <View style={[styles.row, { gap: spacing.md }]}>
        <IconTile name="dumbbell" size={40} />
        <View style={styles.flex}>
          <Text variant="label">{t('onboarding.welcome.slides.sets.exercise')}</Text>
          <Text variant="caption" color="textMuted">
            {t('onboarding.welcome.slides.sets.detail', { count: EXAMPLE_SETS.length })}
          </Text>
        </View>
      </View>
      <View style={{ gap: spacing.xs }}>
        {EXAMPLE_SETS.map((set, index) => {
          const record = index === EXAMPLE_SETS.length - 1;
          return (
            <Animated.View
              key={index}
              entering={FadeInDown.delay(STEP_MS * index)}
              style={[
                styles.row,
                {
                  gap: spacing.md,
                  borderRadius: radii.md,
                  borderWidth: 1.5,
                  borderColor: record ? colors.primary : 'transparent',
                  backgroundColor: record ? colors.selected : colors.background,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                },
              ]}
            >
              <Text variant="captionStrong" color="textMuted">
                {index + 1}
              </Text>
              <Text variant="bodyStrong" style={styles.flex}>
                {weight(set)}
              </Text>
              <Text variant="bodyStrong" color="textMuted">
                {`× ${set.reps}`}
              </Text>
              <Animated.View
                entering={ZoomIn.delay(STEP_MS * (index + 2))}
                style={[styles.tick, { backgroundColor: colors.primary }]}
              >
                <Icon name={record ? 'trophy' : 'check'} size={14} color="onPrimary" />
              </Animated.View>
            </Animated.View>
          );
        })}
      </View>
      {/* The record, as the app announces one: a strip that slides in under the sets. */}
      <Animated.View
        entering={FadeInDown.delay(STEP_MS * 6).springify()}
        style={[
          styles.row,
          {
            gap: spacing.md,
            borderRadius: radii.md,
            backgroundColor: colors.primaryButton,
            padding: spacing.md,
          },
        ]}
      >
        <Icon name="trophy" size={24} color="onPrimary" />
        <View style={styles.flex}>
          <Text variant="label" color="onPrimary">
            {t('onboarding.welcome.slides.sets.record')}
          </Text>
          <Text variant="caption" color="onPrimary">
            {t('onboarding.welcome.slides.sets.recordDetail', {
              set: `${weight(best)} × ${best.reps}`,
            })}
          </Text>
        </View>
      </Animated.View>
    </Card>
  );
}

/** A day's calories filling up, with the macros beside them. */
function FoodIllustration() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const ring = useDrawn();
  const radius = 58;
  const circumference = 2 * Math.PI * radius;
  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - (EATEN_KCAL / TARGET_KCAL) * ring.get()),
  }));
  return (
    <Card style={[styles.row, { gap: spacing.lg }]}>
      <View style={styles.ring}>
        <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 140 140">
          <Circle cx={70} cy={70} r={radius} fill="none" stroke={colors.track} strokeWidth={14} />
          <AnimatedCircle
            animatedProps={ringProps}
            cx={70}
            cy={70}
            r={radius}
            fill="none"
            stroke={colors.primary}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            transform="rotate(-90 70 70)"
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text variant="headline">{format(EATEN_KCAL)}</Text>
          <Text variant="captionStrong" color="textMuted">
            {t('onboarding.welcome.slides.food.of', { total: format(TARGET_KCAL) })}
          </Text>
        </View>
      </View>
      <View style={[styles.flex, { gap: spacing.sm }]}>
        {EXAMPLE_MACROS.map(({ key, eaten, target }) => (
          <View key={key} style={{ gap: spacing.xs }}>
            <View style={[styles.row, styles.between]}>
              <Text variant="captionStrong" color="textMuted">
                {t(`nutrition.macros.${key}`)}
              </Text>
              <Text variant="captionStrong">{`${format(eaten)} / ${format(target)} g`}</Text>
            </View>
            <ProgressBar value={eaten / target} color={key} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** Weekly weigh-ins going down, the change since the first and a streak. */
function ProgressIllustration() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weight = useExampleWeight();
  const line = useDrawn();
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: WEIGH_IN_LENGTH * (1 - line.get()),
  }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: 0.16 * line.get() }));
  const first = WEIGH_INS_KG[0]!;
  const last = WEIGH_INS_KG[WEIGH_INS_KG.length - 1]!;
  return (
    <Card>
      <View style={[styles.row, styles.between]}>
        <Caption style={styles.flex}>{t('onboarding.welcome.slides.progress.weight')}</Caption>
        <Animated.View entering={ZoomIn.delay(STEP_MS * 7)}>
          <StreakBadge streak={EXAMPLE_STREAK} />
        </Animated.View>
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <Text variant="headline">{weight(last)}</Text>
        <Animated.View
          entering={ZoomIn.delay(STEP_MS * 6)}
          style={{
            borderRadius: radii.full,
            backgroundColor: colors.selected,
            paddingHorizontal: spacing.sm,
            paddingVertical: 2,
          }}
        >
          <Text variant="captionStrong" color="primaryText">
            {`−${weight(first - last)}`}
          </Text>
        </Animated.View>
      </View>
      <Svg width="100%" height={CHART.height} viewBox={`0 0 ${CHART.width} ${CHART.height}`}>
        {[0.25, 0.5, 0.75].map((share) => (
          <Path
            key={share}
            d={`M0 ${CHART.height * share} H${CHART.width}`}
            stroke={colors.track}
            strokeWidth={1.5}
            strokeDasharray="4 6"
          />
        ))}
        <AnimatedPath
          animatedProps={areaProps}
          d={`${WEIGH_IN_PATH} L${WEIGH_IN_POINTS.at(-1)!.x} ${CHART.height} L${WEIGH_IN_POINTS[0]!.x} ${CHART.height} Z`}
          fill={colors.primary}
        />
        <AnimatedPath
          animatedProps={lineProps}
          d={WEIGH_IN_PATH}
          fill="none"
          stroke={colors.primary}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={`${WEIGH_IN_LENGTH} ${WEIGH_IN_LENGTH}`}
        />
        {WEIGH_IN_POINTS.map((point, index) => (
          <WeighIn
            key={index}
            x={point.x}
            y={point.y}
            last={index === WEIGH_IN_POINTS.length - 1}
            // Each dot shows as the line reaches it.
            at={(point.x - WEIGH_IN_POINTS[0]!.x) / (CHART.width - 2 * WEIGH_IN_POINTS[0]!.x)}
            progress={line}
          />
        ))}
      </Svg>
      <View style={[styles.row, styles.between]}>
        <Text variant="caption" color="textMuted">
          {t('onboarding.welcome.slides.progress.week', { week: 1 })}
        </Text>
        <Text variant="caption" color="textMuted">
          {t('onboarding.welcome.slides.progress.week', { week: WEIGH_INS_KG.length })}
        </Text>
      </View>
    </Card>
  );
}

type WeighInProps = {
  x: number;
  y: number;
  /** The latest weigh-in, filled in. */
  last: boolean;
  /** How far along the line, from 0 to 1, the dot is. */
  at: number;
  progress: SharedValue<number>;
};

/** A weigh-in on the chart, which pops up as the line is drawn through it. */
function WeighIn({ x, y, last, at, progress }: WeighInProps) {
  const { colors } = useTheme();
  const props = useAnimatedProps(() => ({ r: progress.get() >= at - 0.001 ? 5 : 0 }));
  return (
    <AnimatedCircle
      animatedProps={props}
      cx={x}
      cy={y}
      fill={last ? colors.primary : colors.surface}
      stroke={colors.primary}
      strokeWidth={3}
    />
  );
}

const styles = StyleSheet.create({
  tick: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  ring: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
});
