import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AccountSection } from '@/account/account-section';
import { Screen } from '@/components/ui/screen';
import { Caption } from '@/components/ui/caption';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { AppearanceSection } from './appearance-section';
import { LanguageSection } from './language-section';
import { ProfileSection } from './profile-section';

/** The app's settings, one section per topic. */
export function SettingsScreen() {
  const { t } = useTranslation();
  return (
    <Screen
      onBack={() => router.back()}
      title={
        <Text variant="label" accessibilityRole="header">
          {t('settings.title')}
        </Text>
      }
    >
      <Section title={t('settings.profile')}>
        <ProfileSection />
      </Section>
      <Section title={t('settings.account')}>
        <AccountSection />
      </Section>
      <Section title={t('settings.appearance')}>
        <AppearanceSection />
      </Section>
      <Section title={t('settings.language')}>
        <LanguageSection />
      </Section>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Caption accessibilityRole="header">{title}</Caption>
      {children}
    </View>
  );
}
