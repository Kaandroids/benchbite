import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/coming-soon';

export default function NutritionTab() {
  const { t } = useTranslation();
  return <ComingSoon icon="meal" message={t('comingSoon.nutrition')} />;
}
