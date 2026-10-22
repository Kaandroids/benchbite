import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

type DayChipsProps = {
  /** ISO weekdays, 1 for Monday to 7 for Sunday; none means any day. */
  weekdays: number[];
  /** Grey instead of orange, for inactive workouts. */
  muted?: boolean;
};

/** The weekdays of a workout as small labels, or "Any day" if it has none. */
export function DayChips({ weekdays, muted = false }: DayChipsProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('short');
  const labels = weekdays.length > 0 ? weekdays.map(weekdayName) : [t('workout.anyDay')];

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      {labels.map((label) => (
        <View
          key={label}
          style={[
            styles.chip,
            {
              borderRadius: radii.sm,
              backgroundColor: muted ? colors.track : colors.iconBackground,
            },
          ]}
        >
          <Text variant="caption" color={muted ? 'textMuted' : 'primaryText'} style={styles.label}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  label: {
    fontFamily: fonts.extraBold,
  },
});
