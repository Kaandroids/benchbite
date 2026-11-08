import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useClockFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

const HEIGHT = 110;
/** Room above the highest heart rate for its label. */
const TOP = 18;

type HeartRateChartProps = {
  /** The heart rate every 10 seconds from the start, none where nothing measured it. */
  samples: readonly (number | null)[];
  average: number;
  startedAt: Date;
  finishedAt: Date;
  /** When each set was done, marked under the chart. */
  setTimes: readonly Date[];
};

/** The x of each sample, from 0 to `width`, and its y, the highest at TOP. */
function scale(samples: readonly (number | null)[], width: number) {
  const values = samples.filter((sample): sample is number => sample !== null);
  const low = Math.min(...values) - 5;
  const high = Math.max(...values);
  const span = Math.max(1, high - low);
  const x = (index: number) => (samples.length > 1 ? (index / (samples.length - 1)) * width : 0);
  const y = (bpm: number) => TOP + (1 - (bpm - low) / span) * (HEIGHT - TOP);
  return { low, high, x, y };
}

/** The line through the samples, broken where none was measured, and the area under it. */
function paths(samples: readonly (number | null)[], { x, y }: ReturnType<typeof scale>) {
  let line = '';
  let area = '';
  let start: number | null = null;
  let last = 0;
  samples.forEach((sample, index) => {
    if (sample === null) {
      if (start !== null) area += `L${x(last)},${HEIGHT}L${x(start)},${HEIGHT}Z`;
      start = null;
      return;
    }
    const point = `${x(index).toFixed(1)},${y(sample).toFixed(1)}`;
    line += `${start === null ? 'M' : 'L'}${point}`;
    area += `${start === null ? 'M' : 'L'}${point}`;
    if (start === null) start = index;
    last = index;
  });
  if (start !== null) area += `L${x(last)},${HEIGHT}L${x(start)},${HEIGHT}Z`;
  return { line, area };
}

/**
 * A workout's heart rate over its time (#480, ADR 0104), its average as a dashed line and its
 * highest marked, with a mark under it for each set done.
 */
export function HeartRateChart({
  samples,
  average,
  startedAt,
  finishedAt,
  setTimes,
}: HeartRateChartProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { format } = useNumberFormat();
  const clock = useClockFormat();
  const [width, setWidth] = useState(0);
  const scaled = scale(samples, width);
  const { line, area } = paths(samples, scaled);
  const peak = samples.indexOf(scaled.high);
  const duration = finishedAt.getTime() - startedAt.getTime();
  const lowest = Math.round(scaled.low + 5);
  const highest = Math.round(scaled.high);

  return (
    <View style={{ gap: spacing.xs }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('health.watch.chartLabel', {
          low: format(lowest),
          high: format(highest),
          average: format(Math.round(average)),
          count: setTimes.length,
        })}
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
              {t('health.watch.chartAverage', { average: format(Math.round(average)) })}
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
