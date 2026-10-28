import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { addDays } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { useDayLabel } from './day-name';
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
  const dayLabel = useDayLabel();
  const { spacing } = useTheme();
  const day = addDays(today, -daysBack);
  const canGoBack = daysBack < LOGGABLE_DAYS;
  const canGoForward = daysBack > 0;

  const { name, date } = dayLabel(day, daysBack);

  const step = (icon: 'back' | 'forward', enabled: boolean, by: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(icon === 'back' ? 'nutrition.day.previous' : 'nutrition.day.next')}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      hitSlop={4}
      onPress={() => onChange(daysBack - by)}
      // An arrow alone, without a filled circle, so that the day stands out more than the way
      // to another.
      style={({ pressed }) => [styles.step, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Icon name={icon} size={22} color={enabled ? 'primary' : 'placeholder'} />
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
          {date}
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
