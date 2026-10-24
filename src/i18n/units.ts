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

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;

/** Rounds to one decimal, the precision weights and heights are stored with. */
export const toTenth = (value: number) => Math.round(value * 10) / 10;

/** A weight in kilograms, shown in the given unit with one decimal. */
export function weightIn(unit: WeightUnit, kg: number): number {
  return unit === 'kg' ? toTenth(kg) : toTenth(kg / KG_PER_LB);
}

/**
 * A weight given in the unit, in kilograms: with one decimal from kilograms, and with two from
 * pounds. A tenth of a kilogram is more than two tenths of a pound, so rounding pounds to it would
 * make some of the pounds shown impossible to choose. The database stores one decimal, which can
 * show a pound value up to a tenth off there.
 */
export function weightToKg(unit: WeightUnit, value: number): number {
  return unit === 'kg' ? toTenth(value) : Math.round(value * KG_PER_LB * 100) / 100;
}

/** A weekly pace in kilograms, in the given unit with two decimals, as paces are small. */
export function paceIn(unit: WeightUnit, kg: number): number {
  return Math.round((unit === 'kg' ? kg : kg / KG_PER_LB) * 100) / 100;
}

/** A weekly pace given in the unit, in kilograms with two decimals. */
export function paceToKg(unit: WeightUnit, value: number): number {
  return Math.round((unit === 'kg' ? value : value * KG_PER_LB) * 100) / 100;
}

/** A height in centimetres as whole feet and inches. */
export function heightToFeetAndInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

/** A height in feet and inches, in centimetres with one decimal. */
export function feetAndInchesToCm(feet: number, inches: number): number {
  return toTenth((feet * 12 + inches) * CM_PER_INCH);
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

/** Formats a weight in kilograms as a number in the unit, with at most one decimal. */
export function useWeightFormat() {
  const { format } = useNumberFormat();
  return (kg: number, unit: WeightUnit) => format(weightIn(unit, kg), { maximumFractionDigits: 1 });
}
