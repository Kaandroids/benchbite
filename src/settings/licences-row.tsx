import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SettingRow } from '@/components/ui/setting-row';

/** The settings' way to the licences and credits (#29): a row of its own, under the sections. */
export function LicencesRow() {
  const { t } = useTranslation();
  return (
    <SettingRow
      label={t('licences.title')}
      note={t('settings.licences.body')}
      hint={t('settings.licences.hint')}
      onPress={() => router.push('/licences')}
    />
  );
}
