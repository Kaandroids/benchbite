import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AccountSection, DeleteAccountButton } from '@/account/account-section';
import { HealthSection } from '@/health/health-section';
import { healthStore } from '@/health/health';
import { Screen } from '@/components/ui/screen';
import { Caption } from '@/components/ui/caption';
import { useTheme } from '@/theme';

import { AppearanceSection } from './appearance-section';
import { LanguageSection } from './language-section';
import { PlanSection } from './plan-section';
import { ProfileSection } from './profile-section';
import { WaterGoalSection } from './water-goal-section';

/** The app's settings: the user's plan, then one section per topic. */
export function SettingsScreen() {
  const { t } = useTranslation();
  return (
    <Screen onBack={() => router.back()} title={t('settings.title')}>
      <PlanSection />
      <Section title={t('settings.profile')}>
        <ProfileSection />
      </Section>
      <Section title={t('settings.account')}>
        <AccountSection />
      </Section>
      {healthStore ? (
        <Section title={t('settings.health')}>
          <HealthSection />
        </Section>
      ) : null}
      <Section title={t('settings.waterGoal')}>
        <WaterGoalSection />
      </Section>
      <Section title={t('settings.appearance')}>
        <AppearanceSection />
      </Section>
      <Section title={t('settings.language')}>
        <LanguageSection />
      </Section>
      <DeleteAccountButton />
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
