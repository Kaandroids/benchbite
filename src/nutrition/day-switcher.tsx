import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { addDays } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { LOGGABLE_DAYS } from './meals';

type DaySwitcherProps = {
  today: Date;
  /** How many days before today the day shown is, 0 for today. */
  daysBack: number;
  onChange: (daysBack: number) => void;
};

/** "‹ Today ›" beside the title: steps a day back, up to the days that can be logged, or forward. */
export function DaySwitcher({ today, daysBack, onChange }: DaySwitcherProps) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const day = addDays(today, -daysBack);
  const canGoBack = daysBack < LOGGABLE_DAYS;
  const canGoForward = daysBack > 0;

  const date = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(day);
  const name =
    daysBack === 0
      ? t('nutrition.day.today')
      : daysBack === 1
        ? t('nutrition.day.yesterday')
        : new Intl.DateTimeFormat(i18n.language, { weekday: 'long' }).format(day);

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
      <Icon
        name={icon === 'back' ? 'back' : 'forward'}
        size={18}
        color={enabled ? 'primary' : 'placeholder'}
      />
    </Pressable>
  );

  return (
    <View
      style={[
        styles.pill,
        {
          borderRadius: radii.full,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          gap: spacing.xs,
        },
      ]}
    >
      {step('back', canGoBack, -1)}
      <View style={styles.label} accessible accessibilityLiveRegion="polite">
        <Text variant="captionStrong" align="center" numberOfLines={1}>
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
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    padding: 4,
  },
  step: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    minWidth: 76,
  },
});
