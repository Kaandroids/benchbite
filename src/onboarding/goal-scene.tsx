import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedProps,
  ZoomIn,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { defaultUnits, useNumberFormat } from '@/i18n/units';
import type { Streak } from '@/streak/streak';
import { StreakBadge } from '@/streak/streak-badge';
import { useTheme } from '@/theme';

import type { OnboardingAnswers } from './types';
import { useDrawn } from './use-drawn';

type Goal = NonNullable<OnboardingAnswers['goal']>;

// Example data that shows what the goal looks like in the app; none of it is the user's.
/** A weight in both units, rounded the way each is lifted or weighed. */
type Weight = { kg: number; lb: number };
const WEEKLY_LOSS: Weight = { kg: 0.5, lb: 1 };
/** The top set of the squat, every four weeks. */
const SQUATS: { week: number; weight: Weight }[] = [
  { week: 1, weight: { kg: 60, lb: 135 } },
  { week: 4, weight: { kg: 67.5, lb: 150 } },
  { week: 8, weight: { kg: 75, lb: 165 } },
  { week: 12, weight: { kg: 82.5, lb: 185 } },
];
const SQUAT_STEP: Weight = { kg: 2.5, lb: 5 };
/** The days of a week with a workout, as ISO weekdays. */
const WORKOUT_DAYS = [1, 3, 5];
const EXAMPLE_STREAK: Streak = { count: 12, doneToday: true, days: {} };

/** The drawing box of the charts, stretched to the card's width. */
const BOX = { width: 300, height: 120 };
const BASELINE = BOX.height - 6;
/** The space left and right of the drawing. */
const INSET = 10;
const RIGHT = BOX.width - INSET;
/** The weight's trend, and its length, measured, so the line and its dot finish together. */
const TREND = {
  d: `M${INSET} 22 C 90 26, 150 62, 200 82 S 280 98, ${RIGHT} 100`,
  end: [RIGHT, 100],
  length: 300,
} as const;
/** The daily weigh-ins around the trend, going up and down. */
const DAILY = [22, 32, 18, 38, 30, 46, 40, 58, 52, 68, 62, 80, 74, 92, 86, 100]
  .map(
    (y, index, all) =>
      `${index ? 'L' : 'M'}${INSET + (index * (RIGHT - INSET)) / (all.length - 1)} ${y}`,
  )
  .join(' ');
/** The best set growing every four weeks: the bars' heights as shares of the box. */
const BARS = [0.3, 0.45, 0.65, 0.9];

/** Delay between the parts of a scene appearing. */
const STEP_MS = 180;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const SCENES: Record<Goal, () => ReactNode> = {
  lose_fat: LoseFatScene,
  build_muscle: BuildMuscleScene,
  get_stronger: GetStrongerScene,
  stay_healthy: StayHealthyScene,
};

/** What the goal looks like in the app over time, as a small scene that plays when it shows. */
export function GoalScene({ goal }: { goal: Goal }) {
  const Scene = SCENES[goal];
  return <Scene />;
}

/** Daily weigh-ins going up and down, and the weekly trend through them going down. */
function LoseFatScene() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const weight = useExampleWeight();
  const progress = useDrawn();
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: TREND.length * (1 - progress.get()),
  }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: 0.16 * progress.get() }));
  const endProps = useAnimatedProps(() => ({ r: progress.get() > 0.98 ? 6 : 0 }));
  return (
    <Card>
      <SceneHeader goal="lose_fat" icon="trend" />
      <Svg
        width="100%"
        height={BOX.height}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        accessible={false}
      >
        <Path d={`M${INSET} ${BASELINE} H${RIGHT}`} stroke={colors.track} strokeWidth={2} />
        <Path d={DAILY} fill="none" stroke={colors.track} strokeWidth={2} strokeLinejoin="round" />
        <AnimatedPath
          animatedProps={areaProps}
          d={`${TREND.d} L${RIGHT} ${BASELINE} L${INSET} ${BASELINE} Z`}
          fill={colors.primary}
        />
        <AnimatedPath
          animatedProps={lineProps}
          d={TREND.d}
          fill="none"
          stroke={colors.primary}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${TREND.length} ${TREND.length}`}
        />
        <AnimatedCircle
          animatedProps={endProps}
          cx={TREND.end[0]}
          cy={TREND.end[1]}
          fill={colors.primary}
        />
      </Svg>
      <Chip delay={STEP_MS * 7}>
        {t('onboarding.goalInsight.lose_fat.scene.chip', { weight: weight(WEEKLY_LOSS) })}
      </Chip>
    </Card>
  );
}

/** The best set of a lift growing every four weeks, as bars. */
function BuildMuscleScene() {
  const { t } = useTranslation();
  const progress = useDrawn();
  const width = 44;
  const gap = (RIGHT - INSET - BARS.length * width) / (BARS.length - 1);
  return (
    <Card>
      <SceneHeader goal="build_muscle" icon="dumbbell" />
      <Svg
        width="100%"
        height={BOX.height}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        accessible={false}
      >
        {BARS.map((share, index) => (
          <Bar
            key={index}
            x={INSET + index * (width + gap)}
            width={width}
            height={share * (BASELINE - INSET)}
            // Each bar grows a little after the one before it.
            start={index / (BARS.length + 1)}
            shade={index / (BARS.length - 1)}
            progress={progress}
          />
        ))}
      </Svg>
      <View style={[styles.row, styles.between]}>
        <Text variant="captionStrong" color="textMuted">
          {t('onboarding.goalInsight.week', { week: 1 })}
        </Text>
        <Text variant="captionStrong" color="primaryText">
          {t('onboarding.goalInsight.week', { week: 12 })}
        </Text>
      </View>
    </Card>
  );
}

/** The top set of the squat every four weeks, a little heavier each time, the last a record. */
function GetStrongerScene() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weight = useExampleWeight();
  return (
    <Card>
      <SceneHeader goal="get_stronger" icon="bolt" />
      <View style={{ gap: spacing.xs }}>
        {SQUATS.map((squat, index) => {
          const record = index === SQUATS.length - 1;
          return (
            <Animated.View
              key={squat.week}
              entering={FadeInDown.delay(STEP_MS * (index + 1))}
              style={[
                styles.row,
                {
                  gap: spacing.sm,
                  borderRadius: radii.md,
                  backgroundColor: record ? colors.selected : colors.background,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs,
                },
              ]}
            >
              <Text
                variant="captionStrong"
                color={record ? 'primaryText' : 'textMuted'}
                style={styles.flex}
              >
                {t('onboarding.goalInsight.week', { week: squat.week })}
              </Text>
              {record ? <Icon name="trophy" size={16} color="primary" /> : null}
              <Text variant="bodyStrong" color={record ? 'primaryText' : 'text'}>
                {weight(squat.weight)}
              </Text>
            </Animated.View>
          );
        })}
      </View>
      <Chip delay={STEP_MS * 6}>
        {t('onboarding.goalInsight.get_stronger.scene.chip', { weight: weight(SQUAT_STEP) })}
      </Chip>
    </Card>
  );
}

/** A week with its three workouts done, and the weeks in a row. */
function StayHealthyScene() {
  const { colors, spacing } = useTheme();
  const weekday = useWeekdayFormat('narrow');
  return (
    <Card>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View style={styles.flex}>
          <SceneHeader goal="stay_healthy" icon="heart" />
        </View>
        <Animated.View entering={ZoomIn.delay(STEP_MS * 5)}>
          <StreakBadge streak={EXAMPLE_STREAK} />
        </Animated.View>
      </View>
      <View style={[styles.row, styles.between]}>
        {[1, 2, 3, 4, 5, 6, 7].map((day) => {
          const workout = WORKOUT_DAYS.indexOf(day);
          return (
            <View key={day} style={[styles.day, { gap: spacing.xs }]}>
              <View style={[styles.dot, { backgroundColor: colors.track }]}>
                {workout >= 0 ? (
                  <Animated.View
                    entering={ZoomIn.delay(STEP_MS * (workout + 1))}
                    style={[styles.dot, { backgroundColor: colors.primary }]}
                  >
                    <Icon name="check" size={16} color="onPrimary" />
                  </Animated.View>
                ) : null}
              </View>
              <Text variant="captionStrong" color="textMuted">
                {weekday(day)}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** The scene's icon, what it shows and how. */
function SceneHeader({ goal, icon }: { goal: Goal; icon: IconName }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <IconTile name={icon} size={40} />
      <View style={styles.flex}>
        <Text variant="label">{t(`onboarding.goalInsight.${goal}.scene.label`)}</Text>
        <Text variant="caption" color="textMuted">
          {t(`onboarding.goalInsight.${goal}.scene.detail`)}
        </Text>
      </View>
    </View>
  );
}

/** A tinted note under a scene, which pops in once the rest has played. */
function Chip({ delay, children }: { delay: number; children: string }) {
  const { colors, radii, spacing } = useTheme();
  return (
    <Animated.View
      entering={FadeIn.delay(delay)}
      style={[
        styles.chip,
        {
          borderRadius: radii.md,
          backgroundColor: colors.selected,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
      ]}
    >
      <Text variant="captionStrong" color="primaryText">
        {children}
      </Text>
    </Animated.View>
  );
}

type BarProps = {
  x: number;
  width: number;
  height: number;
  start: number;
  /** From 0 for the first, lightest bar to 1 for the last, in full colour. */
  shade: number;
  progress: SharedValue<number>;
};

function Bar({ x, width, height, start, shade, progress }: BarProps) {
  const { colors } = useTheme();
  const props = useAnimatedProps(() => {
    const grown = Math.min(1, Math.max(0, (progress.get() - start) / (1 - start)));
    return { y: BASELINE - height * grown, height: height * grown };
  });
  return (
    <AnimatedRect
      animatedProps={props}
      x={x}
      width={width}
      rx={8}
      fill={colors.primary}
      fillOpacity={0.35 + 0.65 * shade}
    />
  );
}

/** Formats an example weight in the device's default unit, with the unit after it. */
function useExampleWeight() {
  const { format } = useNumberFormat();
  const unit = defaultUnits().weight;
  return (weight: Weight) => `${format(weight[unit])} ${unit}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  between: {
    justifyContent: 'space-between',
  },
  flex: {
    flex: 1,
  },
  day: {
    alignItems: 'center',
  },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    alignSelf: 'flex-start',
  },
});
