import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, type CardProps } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Text } from '@/components/ui/text';
import { useStreak } from '@/streak/use-streak';
import { useTheme } from '@/theme';

type StreakButtonProps = {
  entering?: CardProps['entering'];
  today: Date;
};

/** Opens the streak calendar (ADR 0047), with the streak and the freezes left. */
export function StreakButton({ entering, today }: StreakButtonProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { streak, freezes } = useStreak(today);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/progress/streak')}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Card entering={entering}>
        <View style={[styles.row, { gap: spacing.md }]}>
          <IconTile name="flame" color="snack" background="snackBackground" />
          <View style={styles.text}>
            <Text variant="label">{t('progress.streak.calendar')}</Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {[
                t('streak.label', { count: streak.count }),
                ...(freezes !== undefined
                  ? [t('progress.streak.freezes', { count: freezes })]
                  : []),
              ].join(' · ')}
            </Text>
          </View>
          <Icon name="forward" color="textMuted" />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
});
