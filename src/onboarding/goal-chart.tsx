import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import type { OnboardingAnswers } from './types';
import { useDrawn } from './use-drawn';

type Goal = NonNullable<OnboardingAnswers['goal']>;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** The drawing box, stretched to the card's width. */
const BOX = { width: 300, height: 140 };
const BASELINE = BOX.height - 6;
/** The space left and right of the drawing. */
const INSET = 10;
const RIGHT = BOX.width - INSET;

/**
 * Each line chart, the point it ends on, which gets a dot, and its length, measured, so that the
 * line, its dot and the area under it finish drawing together.
 */
const LINES = {
  /** The weight going down steadily, for fat loss. */
  lose_fat: {
    d: `M${INSET} 26 C 90 30, 150 72, 200 96 S 280 116, ${RIGHT} 118`,
    end: [RIGHT, 118],
    length: 300,
  },
  /** A little more each week, for strength. */
  get_stronger: {
    d: `M${INSET} 122 H66 V100 H122 V78 H178 V54 H234 V30 H${RIGHT}`,
    end: [RIGHT, 30],
    length: 372,
  },
  /** A steady heartbeat, for staying healthy. */
  stay_healthy: {
    d: `M${INSET} 80 H70 L84 50 L98 112 L112 30 L126 96 L140 80 H190 L204 56 L218 104 L232 40 L246 92 L260 80 H${RIGHT}`,
    end: [RIGHT, 80],
    length: 624,
  },
} as const;
/** Muscle growing week by week: the bars' heights as shares of the box. */
const BARS = [0.3, 0.4, 0.5, 0.63, 0.8];

/** What the chart says the goal looks like over time, in a card with its two ends labelled. */
export function GoalChart({ goal }: { goal: Goal }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const progress = useDrawn();
  return (
    <Card style={{ gap: spacing.sm }}>
      <Svg
        width="100%"
        height={BOX.height}
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        accessible={false}
      >
        <Path d={`M${INSET} ${BASELINE} H${RIGHT}`} stroke={colors.track} strokeWidth={2} />
        {goal === 'build_muscle' ? (
          <Bars progress={progress} />
        ) : (
          <Line {...LINES[goal]} area={goal === 'lose_fat'} progress={progress} />
        )}
      </Svg>
      <View style={[styles.row, styles.between]}>
        <Text variant="captionStrong" color="textMuted">
          {t(`onboarding.goalInsight.${goal}.from`)}
        </Text>
        <Text variant="captionStrong" color="primaryText">
          {t(`onboarding.goalInsight.${goal}.to`)}
        </Text>
      </View>
    </Card>
  );
}

type LineProps = {
  d: string;
  end: readonly [number, number];
  length: number;
  /** Shades the area under the line. */
  area: boolean;
  progress: SharedValue<number>;
};

function Line({ d, end, length, area, progress }: LineProps) {
  const { colors } = useTheme();
  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.get()),
  }));
  const areaProps = useAnimatedProps(() => ({ fillOpacity: 0.16 * progress.get() }));
  const endProps = useAnimatedProps(() => ({ r: progress.get() > 0.98 ? 7 : 0 }));
  return (
    <>
      {area ? (
        <AnimatedPath
          animatedProps={areaProps}
          d={`${d} L${end[0]} ${BASELINE} L${INSET} ${BASELINE} Z`}
          fill={colors.primary}
        />
      ) : null}
      <AnimatedPath
        animatedProps={lineProps}
        d={d}
        fill="none"
        stroke={colors.primary}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${length} ${length}`}
      />
      <AnimatedCircle animatedProps={endProps} cx={end[0]} cy={end[1]} fill={colors.primary} />
    </>
  );
}

function Bars({ progress }: { progress: SharedValue<number> }) {
  const width = 36;
  const gap = (RIGHT - INSET - BARS.length * width) / (BARS.length - 1);
  return (
    <>
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
    </>
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

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  between: {
    justifyContent: 'space-between',
  },
});
