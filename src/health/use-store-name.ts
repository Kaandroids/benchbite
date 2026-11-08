import { useTranslation } from 'react-i18next';

import { healthStore } from './health';

/** The name of the phone's health store, or none where it has none. */
export function useStoreName(): string | null {
  const { t } = useTranslation();
  return healthStore ? t(`health.${healthStore}`) : null;
}
