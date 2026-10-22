import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import type { Streak } from './streak';

/** The streak's length, lit once today is done and grey while it is still open. */
export function StreakBadge({ streak }: { streak: Streak }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { format } = useNumberFormat();
  const lit = streak.doneToday;
  return (
    <View
      accessible
      accessibilityLabel={t('streak.label', { count: streak.count })}
      style={[
        styles.badge,
        {
          gap: spacing.xs,
          paddingHorizontal: spacing.md,
          borderRadius: radii.full,
          backgroundColor: lit ? colors.iconBackground : colors.track,
        },
      ]}
    >
      <Icon name="flame" size={20} color={lit ? 'primary' : 'textMuted'} />
      <Text variant="bodyStrong" color={lit ? 'primaryText' : 'textMuted'}>
        {format(streak.count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
});
