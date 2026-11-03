import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

/**
 * Over the workouts while some wait for premium: how many, that none is deleted, and premium to
 * get them back (ADR 0079).
 */
export function HeldBanner({ count }: { count: number }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const openPremium = useOpenPremium();
  const title = t('workout.held.banner', { count });
  const note = t('workout.held.nothingDeleted');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} ${note}`}
      accessibilityHint={t('workout.held.premium')}
      onPress={openPremium}
      style={({ pressed }) => [
        styles.banner,
        {
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderRadius: radii.lg,
          backgroundColor: colors.inverseSurface,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon name="lock" size={20} color="primary" />
      <View style={styles.text}>
        <Text variant="captionStrong" color="onInverse">
          {title}
        </Text>
        <Text variant="caption" color="onInverseMuted">
          {note}
        </Text>
      </View>
      <Text variant="captionStrong" color="onInverse">
        {t('workout.held.premium')} ›
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
});
