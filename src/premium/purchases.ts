import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

/**
 * Says that purchases open soon, for what needs the store until they are built: restoring a
 * purchase. Plans are given by hand until then (ADR 0078).
 */
export function usePurchasesSoon() {
  const { t } = useTranslation();
  return () => Alert.alert(t('premium.soon.title'), t('premium.soon.message'));
}
