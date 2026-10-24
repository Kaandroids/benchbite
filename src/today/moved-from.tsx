import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { fromIsoDate, isoWeekday, useWeekdayFormat } from '@/i18n/dates';
import { fonts, useTheme } from '@/theme';

/** "Moved from Monday", for a workout moved to another day. */
export function MovedFrom({ date }: { date: string }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  const weekdayName = useWeekdayFormat();
  return (
    <View style={[styles.chip, { backgroundColor: colors.selected, borderRadius: radii.full }]}>
      <Icon name="arrow" size={12} color="primaryText" />
      <Text variant="caption" color="primaryText" style={styles.bold}>
        {t('today.workout.movedFrom', {
          day: weekdayName(isoWeekday(fromIsoDate(date))),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontFamily: fonts.extraBold,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
});
