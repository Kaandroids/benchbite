import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useOpenPremium } from '@/premium/open-premium';
import { useTheme } from '@/theme';

/**
 * In place of the composer, for a user whose plan has no chat (#411): the chats can be read, and
 * going on in them takes premium.
 */
export function LockedComposer() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const openPremium = useOpenPremium();
  return (
    <View style={{ gap: spacing.md }}>
      <View
        style={[
          styles.field,
          {
            gap: spacing.sm + 2,
            paddingHorizontal: spacing.lg,
            borderRadius: radii.xl,
            backgroundColor: colors.track,
          },
        ]}
      >
        <Icon name="lock" size={18} color="textMuted" />
        <Text color="textMuted" style={styles.flex}>
          {t('bite.locked')}
        </Text>
      </View>
      <View style={{ paddingHorizontal: spacing.md }}>
        <Button label={t('premium.page.get')} size="small" onPress={openPremium} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  flex: {
    flex: 1,
  },
});
