import { useTranslation } from 'react-i18next';

/**
 * Upper-cases text by the rules of the app language rather than the device's, which can differ:
 * Turkish turns "i" into "İ", English into "I".
 */
export function useUpperCase() {
  const { i18n } = useTranslation();
  return (text: string) => text.toLocaleUpperCase(i18n.language);
}
