import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { RoundIconButton } from '@/components/ui/round-icon-button';

/** The round button that opens the settings. */
export function SettingsButton() {
  const { t } = useTranslation();
  return (
    <RoundIconButton
      icon="settings"
      color="text"
      background="surface"
      label={t('settings.open')}
      onPress={() => router.push('/settings')}
      size={44}
      bordered
    />
  );
}
