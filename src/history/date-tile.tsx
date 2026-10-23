import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

/** A day as a small tile: its weekday above its date, as on a calendar. */
export function DateTile({ date, large = false }: { date: Date; large?: boolean }) {
  const { colors, radii } = useTheme();
  const weekday = useWeekdayFormat('short');
  return (
    <View
      style={[
        styles.tile,
        large ? styles.large : styles.small,
        { borderRadius: large ? radii.lg : radii.md, backgroundColor: colors.selected },
      ]}
    >
      <Text variant="caption" color="primaryText" style={styles.weekday}>
        {weekday(isoWeekday(date)).toLocaleUpperCase()}
      </Text>
      <Text variant={large ? 'title' : 'headline'} style={large ? styles.largeDay : styles.day}>
        {date.getDate()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    width: 48,
    height: 52,
  },
  large: {
    width: 60,
    height: 66,
  },
  weekday: {
    fontFamily: fonts.extraBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.4,
  },
  day: {
    lineHeight: 24,
  },
  largeDay: {
    lineHeight: 32,
  },
});
