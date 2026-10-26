import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { RaisedPressable } from '@/components/ui/raised-pressable';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { SESSION_MINUTES } from '../training';
import { useStep } from '../use-step';

/** The minutes a full ring stands for, so the longest choice nearly closes it. */
const FULL_RING_MINUTES = 90;
const RING = { size: 64, stroke: 8 };
const RADIUS = (RING.size - RING.stroke) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * How long a workout may take, as four cards in a grid, each with a ring that fills with its
 * length; the plan builder fits each session into it.
 */
export function SessionLengthStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, back, choose } = useStep('session-length');

  return (
    <Screen progress={progress} onBack={back}>
      <Text variant="title" accessibilityRole="header">
        {t('onboarding.steps.session-length.title')}
      </Text>
      <View style={[styles.grid, { gap: spacing.md }]}>
        {SESSION_MINUTES.map((sessionMinutes) => (
          <LengthCard
            key={sessionMinutes}
            minutes={sessionMinutes}
            title={
              sessionMinutes === 75
                ? t('onboarding.sessionLength.longest')
                : t('onboarding.minutes', { count: sessionMinutes })
            }
            description={t(`onboarding.sessionLength.descriptions.${sessionMinutes}`)}
            selected={answers.sessionMinutes === sessionMinutes}
            onPress={() => choose({ sessionMinutes })}
          />
        ))}
      </View>
    </Screen>
  );
}

type LengthCardProps = {
  minutes: number;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
};

/** One length: a ring filled in proportion to it, the length and what fits in it. */
function LengthCard({ minutes, title, description, selected, onPress }: LengthCardProps) {
  const { colors, radii, spacing } = useTheme();
  const filled = (CIRCUMFERENCE * minutes) / FULL_RING_MINUTES;
  return (
    <RaisedPressable
      accessibilityRole="radio"
      accessibilityLabel={`${title}, ${description}`}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      haptic="selection"
      ledgeColor={selected ? colors.primary : colors.border}
      borderRadius={radii.lg}
      style={styles.cell}
      faceStyle={[
        styles.face,
        {
          gap: spacing.sm,
          padding: spacing.lg,
          backgroundColor: selected ? colors.selected : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Svg width={RING.size} height={RING.size} accessible={false}>
        <Circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.track}
          strokeWidth={RING.stroke}
        />
        <Circle
          cx={RING.size / 2}
          cy={RING.size / 2}
          r={RADIUS}
          fill="none"
          stroke={colors.primary}
          strokeWidth={RING.stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${RING.size / 2} ${RING.size / 2})`}
        />
      </Svg>
      <Text variant="headline">{title}</Text>
      <Text variant="caption" color="textMuted" align="center">
        {description}
      </Text>
    </RaisedPressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Two to a row, the gap between them shared.
  cell: {
    flexBasis: '45%',
    flexGrow: 1,
  },
  face: {
    flexGrow: 1,
    alignItems: 'center',
    borderWidth: 2,
  },
});
