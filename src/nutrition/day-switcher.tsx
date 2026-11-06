import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { StepArrow } from '@/components/ui/step-arrow';
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

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <StepArrow
        direction="back"
        label={t('nutrition.day.previous')}
        onPress={canGoBack ? () => onChange(daysBack + 1) : undefined}
      />
      <View style={styles.label} accessible accessibilityLiveRegion="polite">
        <Text variant="label" align="center" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="caption" color="textMuted" align="center" numberOfLines={1}>
          {date}
        </Text>
      </View>
      <StepArrow
        direction="forward"
        label={t('nutrition.day.next')}
        onPress={canGoForward ? () => onChange(daysBack - 1) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    flex: 1,
  },
});
