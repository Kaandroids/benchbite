import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/coming-soon';
import { Text } from '@/components/ui/text';

export default function TodayTab() {
  const { t } = useTranslation();
  return (
    <ComingSoon icon="home" message={t('comingSoon.today')}>
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
