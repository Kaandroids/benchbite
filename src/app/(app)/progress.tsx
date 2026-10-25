import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/coming-soon';
import { Text } from '@/components/ui/text';
import { SettingsButton } from '@/settings/settings-button';

export default function ProgressTab() {
  const { t } = useTranslation();
  return (
    <ComingSoon
      icon="chart"
      message={t('comingSoon.progress')}
      title={t('tabs.progress')}
      action={<SettingsButton />}
    >
      {__DEV__ ? (
        <Link href="/dev/components">
          <Text variant="bodyStrong" color="primaryText">
            Open the component gallery
          </Text>
        </Link>
      ) : null}
    </ComingSoon>
  );
}
