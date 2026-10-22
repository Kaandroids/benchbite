import { useTranslation } from 'react-i18next';

import { ComingSoon } from '@/components/coming-soon';

export default function WorkoutTab() {
  const { t } = useTranslation();
  return <ComingSoon icon="dumbbell" message={t('comingSoon.workout')} />;
}
