import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

/**
 * Opens what premium adds, from wherever the plan stops the user. Until the premium page is built
 * (#411), it says that premium is on its way.
 */
export function useOpenPremium() {
  const { t } = useTranslation();
  return () => Alert.alert(t('premium.soon.title'), t('premium.soon.message'));
}
