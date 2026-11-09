import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useClockFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { SAMPLE_SECONDS } from './samples';

const HEIGHT = 110;
/** Room above the highest heart rate for its label. */
const TOP = 18;
/** Room below the lowest, so that the line keeps off the axis. */
const PADDING_BPM = 5;
/**
 * The longest gap the line runs across, in samples of 10 seconds: a watch that measures every few
 * minutes, as without a workout started on it, still draws a line.
 */
const LONGEST_JOINED_GAP = 12;

type HeartRateChartProps = {
  /** The heart rate every 10 seconds from the start, none where nothing measured it. */
  samples: readonly (number | null)[];
  /** The average and the highest heart rate, as the watch measured them over the whole workout. */
  average: number;
  max: number;
  startedAt: Date;
  finishedAt: Date;
  /** When each set was done, marked under the chart. */
  setTimes: readonly Date[];
};

/**
 * The x of each sample, from 0 to `width` over the workout's real length in milliseconds, as the set
 * marks are placed, and its y, the highest at TOP.
 */
export function heartRateScale(
  samples: readonly (number | null)[],
  width: number,
  duration: number,
) {
  const values = samples.filter((sample): sample is number => sample !== null);
  const min = Math.min(...values);
  const high = Math.max(...values);
  const low = min - PADDING_BPM;
  const span = Math.max(1, high - low);
  const x = (index: number) =>
    Math.min(width, ((index * SAMPLE_SECONDS * 1000) / Math.max(1, duration)) * width);
  const y = (bpm: number) => TOP + (1 - (bpm - low) / span) * (HEIGHT - TOP);
  return { min, high, x, y };
}

/**
 * The line through the samples and the area under it, run across short gaps and broken at long
 * ones, and the samples left alone between long gaps, drawn as dots.
 */
export function heartRatePaths(
  samples: readonly (number | null)[],
  { x, y }: ReturnType<typeof heartRateScale>,
) {
  const runs: number[][] = [];
  let previous = -Infinity;
  samples.forEach((sample, index) => {
    if (sample === null) return;
    if (index - previous > LONGEST_JOINED_GAP + 1 || runs.length === 0) runs.push([]);
    runs[runs.length - 1]!.push(index);
    previous = index;
  });
  let line = '';
  let area = '';
  const dots: { cx: number; cy: number }[] = [];
  for (const run of runs) {
    if (run.length === 1) {
      dots.push({ cx: x(run[0]!), cy: y(samples[run[0]!]!) });
      continue;
    }
    const points = run.map((index) => `${x(index).toFixed(1)},${y(samples[index]!).toFixed(1)}`);
    line += `M${points.join('L')}`;
    area += `M${points.join('L')}L${x(run[run.length - 1]!)},${HEIGHT}L${x(run[0]!)},${HEIGHT}Z`;
  }
  return { line, area, dots };
}

/**
 * A workout's heart rate over its time (#480, ADR 0104), its average as a dashed line and its
 * highest marked, with a mark under it for each set done.
 */
export function HeartRateChart({
  samples,
  average,
  max,
  startedAt,
  finishedAt,
  setTimes,
}: HeartRateChartProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const clock = useClockFormat();
  const [width, setWidth] = useState(0);
  const duration = finishedAt.getTime() - startedAt.getTime();
  const scaled = heartRateScale(samples, width, duration);
  const { line, area, dots } = heartRatePaths(samples, scaled);
  // The dot sits on the highest 10 seconds; its label is the watch's own highest, as the card says.
  const peak = samples.indexOf(scaled.high);
  const lowest = Math.round(scaled.min);
  const highest = Math.round(max);
  const figures = {
    low: format(lowest),
    high: format(highest),
    average: format(Math.round(average)),
  };

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          // A workout logged before set times were kept says nothing of its sets.
          setTimes.length
            ? t('health.watch.chartLabel', { ...figures, count: setTimes.length })
            : t('health.watch.chartLabelNoSets', figures)
        }
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: HEIGHT }}
      >
        {width > 0 ? (
          <>
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} y1={HEIGHT - 0.5} x2={width} y2={HEIGHT - 0.5} stroke={colors.border} />
              <Path d={area} fill={colors.snackBackground} />
              <Path
                d={line}
                fill="none"
                stroke={colors.snack}
                strokeWidth={2.4}
                strokeLinejoin="round"
              />
              <Line
                x1={0}
                y1={scaled.y(average)}
                x2={width}
                y2={scaled.y(average)}
                stroke={colors.textMuted}
                strokeWidth={1.2}
                strokeDasharray="4 4"
              />
              {dots.map(({ cx, cy }) => (
                <Circle key={cx} cx={cx} cy={cy} r={2.5} fill={colors.snack} />
              ))}
              {peak >= 0 ? (
                <Circle cx={scaled.x(peak)} cy={scaled.y(scaled.high)} r={4} fill={colors.snack} />
              ) : null}
            </Svg>
            <Text
              variant="captionStrong"
              color="textMuted"
              style={[
                styles.average,
                { top: scaled.y(average) - 20, backgroundColor: colors.surface },
              ]}
            >
              {t('health.watch.chartAverage', { average: figures.average })}
            </Text>
            {peak >= 0 ? (
              <Text
                variant="captionStrong"
                color="snack"
                style={[
                  styles.peak,
                  { left: Math.min(Math.max(0, scaled.x(peak) - 14), width - 32) },
                ]}
              >
                {format(highest)}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
      {setTimes.length > 0 ? (
        <View style={styles.marks} importantForAccessibility="no-hide-descendants">
          {setTimes.map((at) => (
            <View
              key={at.getTime()}
              style={[
                styles.mark,
                {
                  left: `${Math.min(100, Math.max(0, ((at.getTime() - startedAt.getTime()) / duration) * 100))}%`,
                  backgroundColor: colors.textMuted,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
      <View style={styles.axis} importantForAccessibility="no-hide-descendants">
        <Text variant="caption" color="textMuted">
          {clock(startedAt)}
        </Text>
        <Text variant="caption" color="textMuted">
          {clock(finishedAt)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  average: {
    paddingHorizontal: 4,
    position: 'absolute',
    right: 0,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mark: {
    borderRadius: 2,
    height: 10,
    marginLeft: -1.5,
    position: 'absolute',
    width: 3,
  },
  marks: {
    height: 10,
  },
  peak: {
    position: 'absolute',
    top: -2,
  },
});
