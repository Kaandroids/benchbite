/** How a plan is billed, as `billing_period` in the database has it. */
export type Billing = 'yearly' | 'monthly';

/** A plan's prices as the store gives them, each already formatted in the user's currency. */
export type PlanPrices = {
  yearly: string;
  monthly: string;
  /** The yearly price divided by twelve. */
  yearlyPerMonth: string;
  /** How much less the yearly plan costs than twelve months, in whole percent. */
  yearlySavePercent: number;
};
