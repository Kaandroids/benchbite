import { useTranslation } from 'react-i18next';

import { healthStore } from './health';

/** The name of the phone's health store, or none where it has none. */
export function useStoreName(): string | null {
  const { t } = useTranslation();
  return healthStore ? t(`health.${healthStore}`) : null;
}

/**
 * Where something measured came from, in words: "Apple Watch, through Apple Health", the store alone
 * when no app is named, or the app alone where the phone has no store. Null without either.
 */
export function useSourceThrough() {
  const { t } = useTranslation();
  const store = useStoreName();
  return (source: string | null): string | null => {
    if (!store) return source;
    return source
      ? t('health.watch.through', { source, store })
      : t('health.watch.throughStore', { store });
  };
}
