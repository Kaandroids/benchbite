import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

const HEIGHT = 120;
const INSET = 12;

type WeightChartProps = {
  /** Shown under the start and the end of the line, such as "80 kg" and "Today". */
  start: { value: string; label: string };
  end: { value: string; label: string };
  /** Whether the weight goes down; the line falls from the top left or rises from the bottom. */
  falling: boolean;
};

/** The projected weight as an eased line from today to the target date. */
export function WeightChart({ start, end, falling }: WeightChartProps) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);

  const x0 = INSET;
  const x1 = Math.max(INSET, width - INSET);
  const [y0, y1] = falling ? [INSET, HEIGHT - INSET] : [HEIGHT - INSET, INSET];
  const curve = `M ${x0} ${y0} C ${x0 + (x1 - x0) * 0.45} ${y0}, ${x1 - (x1 - x0) * 0.45} ${y1}, ${x1} ${y1}`;

  return (
    <View style={{ gap: spacing.sm }}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.chart}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Path
              d={`${curve} L ${x1} ${HEIGHT} L ${x0} ${HEIGHT} Z`}
              fill={colors.primary}
              fillOpacity={0.12}
            />
            <Path
              d={curve}
              stroke={colors.primary}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
            />
            <Circle
              cx={x0}
              cy={y0}
              r={6}
              fill={colors.surface}
              stroke={colors.primary}
              strokeWidth={3}
            />
            <Circle cx={x1} cy={y1} r={7} fill={colors.primary} />
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        <View>
          <Text variant="bodyStrong">{start.value}</Text>
          <Text variant="caption" color="textMuted">
            {start.label}
          </Text>
        </View>
        <View style={styles.end}>
          <Text variant="bodyStrong" color="primaryText">
            {end.value}
          </Text>
          <Text variant="caption" color="textMuted">
            {end.label}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    height: HEIGHT,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  end: {
    alignItems: 'flex-end',
  },
});
