import type { PlanPrices } from './prices';

/**
 * The planned prices, which the premium page and the previews show until the store's are read with
 * the purchases.
 */
export const SAMPLE_PRICES: PlanPrices = {
  yearly: '€83.88',
  monthly: '€8.99',
  yearlyPerMonth: '€6.99',
  yearlySavePercent: 22,
};

/** The prices the plans are offered at; the store's take their place with the purchases. */
export const PLAN_PRICES = SAMPLE_PRICES;
