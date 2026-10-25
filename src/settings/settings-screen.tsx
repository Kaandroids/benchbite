import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AccountSection } from '@/account/account-section';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** The app's settings, one section per topic. */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Screen onBack={() => router.back()}>
      <Text variant="title" accessibilityRole="header">
        {t('settings.title')}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <Text variant="captionStrong" color="textMuted" accessibilityRole="header">
          {t('settings.account').toLocaleUpperCase()}
        </Text>
        <AccountSection />
      </View>
    </Screen>
  );
}
