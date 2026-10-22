import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/coming-soon';

export default function ProgressTab() {
  const { t } = useTranslation();
  return <ComingSoon icon="chart" message={t('comingSoon.progress')} />;
}
