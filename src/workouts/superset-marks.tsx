import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { minutesAndSeconds } from '@/lib/time';
import { useTheme } from '@/theme';

import type { SupersetPlace } from './supersets';

/**
 * The line beside a superset's exercises that joins them, from its first to its last. `reach`
 * stretches it over the space between two rows, so that it runs on through the superset.
 */
export function SupersetLine({
  place,
  inset,
  reach = 0,
}: {
  place: NonNullable<SupersetPlace>;
  /** How far from the row's edge it starts at the first exercise and ends at the last. */
  inset: number;
  reach?: number;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: colors.planned,
          marginTop: place.first ? inset : -reach,
          marginBottom: place.last ? inset : -reach,
        },
      ]}
    />
  );
}

/**
 * The line over a superset that says it is one, with its rest after each round, or what `label`
 * says instead, such as the round a workout in progress is in.
 */
export function SupersetHeader({
  style,
  ...says
}: ({ restSeconds: number } | { label: string }) & { style?: StyleProp<ViewStyle> }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.header, { gap: spacing.xs }, style]}>
      <Icon name="link" size={15} color="primaryText" />
      <Text variant="captionStrong" color="primaryText">
        {'label' in says
          ? says.label
          : says.restSeconds > 0
            ? t('workout.superset.header', { time: minutesAndSeconds(says.restSeconds) })
            : t('workout.superset.headerNoRest')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
