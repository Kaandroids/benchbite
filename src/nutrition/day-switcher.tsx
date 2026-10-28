import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { addDays, useDayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { useDayName } from './day-name';
import { LOGGABLE_DAYS } from './meals';

type DaySwitcherProps = {
  today: Date;
  /** How many days before today the day shown is, 0 for today. */
  daysBack: number;
  onChange: (daysBack: number) => void;
};

/**
 * "‹ Today ›" across the top of the day's summary: steps a day back, up to the days that can be
 * logged, or forward.
 */
export function DaySwitcher({ today, daysBack, onChange }: DaySwitcherProps) {
  const { t } = useTranslation();
  const dayName = useDayName();
  // In full, as the Today tab writes it: Tuesday, October 27.
  const longDate = useDayFormat();
  const { colors, radii, spacing } = useTheme();
  const day = addDays(today, -daysBack);
  const canGoBack = daysBack < LOGGABLE_DAYS;
  const canGoForward = daysBack > 0;

  const name = dayName(day, daysBack);

  const step = (icon: 'back' | 'forward', enabled: boolean, by: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(icon === 'back' ? 'nutrition.day.previous' : 'nutrition.day.next')}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={4}
      onPress={() => onChange(daysBack - by)}
      style={({ pressed }) => [
        styles.step,
        {
          borderRadius: radii.full,
          backgroundColor: enabled ? colors.iconBackground : colors.background,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
    >
      <Icon name={icon} size={18} color={enabled ? 'primary' : 'placeholder'} />
    </Pressable>
  );

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {step('back', canGoBack, -1)}
      <View style={styles.label} accessible accessibilityLiveRegion="polite">
        <Text variant="label" align="center" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" align="center" numberOfLines={1}>
          {longDate(day)}
        </Text>
      </View>
      {step('forward', canGoForward, 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  step: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
});
