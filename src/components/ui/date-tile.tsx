import { StyleSheet, View } from 'react-native';

import { useUpperCase } from '@/i18n/case';
import { isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

import { Text } from './text';

type DateTileProps = {
  date: Date;
  large?: boolean;
  /** On orange, or on grey where it would add to too much orange. */
  tinted?: boolean;
  /** In the colour of workouts from other apps (ADR 0106), set apart from Benchbite's orange. */
  outside?: boolean;
};

/** A day as a small tile: its weekday above its date, as on a calendar. */
export function DateTile({ date, large = false, tinted = true, outside = false }: DateTileProps) {
  const { colors, radii } = useTheme();
  const weekday = useWeekdayFormat('short');
  const upperCase = useUpperCase();
  return (
    <View
      style={[
        styles.tile,
        large ? styles.large : styles.small,
        {
          borderRadius: large ? radii.lg : radii.md,
          backgroundColor: outside
            ? colors.dinnerBackground
            : tinted
              ? colors.selected
              : colors.background,
        },
      ]}
    >
      <Text variant="caption" color={outside ? 'dinner' : 'primaryText'} style={styles.weekday}>
        {upperCase(weekday(isoWeekday(date)))}
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
