import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useWeekdayFormat } from '@/i18n/dates';
import { range } from '@/lib/math';
import { useTheme } from '@/theme';

/** A row of the seven weekdays, from Monday, to pick any number of. */
export function WeekdayPicker({
  value,
  onChange,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const { colors, radii, spacing } = useTheme();
  const weekdayName = useWeekdayFormat('narrow');
  const longWeekdayName = useWeekdayFormat('long');
  return (
    <View style={[styles.days, { gap: spacing.xs }]}>
      {range(1, 7).map((weekday) => {
        const on = value.includes(weekday);
        return (
          <Pressable
            key={weekday}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={longWeekdayName(weekday)}
            onPress={() =>
              onChange(
                on
                  ? value.filter((day) => day !== weekday)
                  : [...value, weekday].sort((a, b) => a - b),
              )
            }
            style={[
              styles.day,
              {
                borderRadius: radii.full,
                backgroundColor: on ? colors.primaryButton : colors.surface,
                borderColor: on ? colors.primaryButton : colors.border,
              },
            ]}
          >
            <Text variant="label" color={on ? 'onPrimary' : 'text'}>
              {weekdayName(weekday)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  days: {
    flexDirection: 'row',
  },
  day: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
