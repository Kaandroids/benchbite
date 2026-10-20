import { getLocales } from 'expo-localization';
import { useTranslation } from 'react-i18next';

export type WeightUnit = 'kg' | 'lb';
export type HeightUnit = 'cm' | 'ft';
export type Units = { weight: WeightUnit; height: HeightUnit };

/**
 * The units most people in the device's region expect. The United Kingdom gives height in feet
 * and inches but weight mostly in kilograms (or stones, which Benchbite does not support).
 */
export function defaultUnits(): Units {
  switch (getLocales()[0]?.measurementSystem) {
    case 'us':
      return { weight: 'lb', height: 'ft' };
    case 'uk':
      return { weight: 'kg', height: 'ft' };
    default:
      return { weight: 'kg', height: 'cm' };
  }
}

/**
 * Formats numbers for the app language, for example 72.5 in English and 72,5 in German and
 * Turkish. It follows the app language rather than the device region, so that numbers match
 * the text around them.
 */
export function useNumberFormat() {
  const { i18n } = useTranslation();
  const language = i18n.language;
  const format = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(language, options).format(value);
  const decimalSeparator = format(1.5).charAt(1);
  return { format, decimalSeparator };
}
