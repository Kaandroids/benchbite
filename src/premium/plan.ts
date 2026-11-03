import { useQuery } from '@tanstack/react-query';

import type { Database } from '@/lib/database.types';
import { supabase } from '@/lib/supabase';

import type { Billing } from './prices';

type Plan = Database['public']['Enums']['plan'];

/** One AI window of a paid plan: the share of it left, from 0 to 1, and when it starts again. */
export type Window = { left: number; resetsAt: Date };

/**
 * The user's plan as the premium page shows it (ADR 0078): on the free plan, the week's meal
 * photos; on the trial and premium, how they are billed, when they renew and how much of each AI
 * window is left, never in money.
 */
export type PlanSummary =
  | { plan: 'free'; photos: { perWeek: number; left: number; resetsAt: Date } }
  | {
      plan: Exclude<Plan, 'free'>;
      billing: Billing;
      renewsAt: Date;
      /** Null on a plan without a weekly budget. */
      week: Window | null;
      period: Window;
    };

export const PLAN_SUMMARY_KEY = ['plan-summary'];

type Row = Database['public']['CompositeTypes']['plan_summary'];

function windowOf(left: number | null, resetsAt: string | null): Window | null {
  return left === null || resetsAt === null ? null : { left, resetsAt: new Date(resetsAt) };
}

/** Reads plan_summary()'s row into a summary; null for a row missing what its plan needs. */
export function toPlanSummary(row: Row): PlanSummary | null {
  if (row.plan === 'free') {
    if (row.photos_per_week === null || row.photos_left === null || !row.photos_reset_at) {
      return null;
    }
    return {
      plan: 'free',
      photos: {
        perWeek: row.photos_per_week,
        left: row.photos_left,
        resetsAt: new Date(row.photos_reset_at),
      },
    };
  }
  const period = windowOf(row.period_left, row.period_resets_at);
  if (!row.plan || !row.billing || !row.period_end || !period) {
    return null;
  }
  return {
    plan: row.plan,
    billing: row.billing,
    renewsAt: new Date(row.period_end),
    week: windowOf(row.week_left, row.week_resets_at),
    period,
  };
}

/** The signed-in user's plan; a guest's is the free plan, without AI until they have an account. */
export function usePlanSummary() {
  return useQuery({
    queryKey: PLAN_SUMMARY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plan_summary').single();
      if (error) {
        throw error;
      }
      const summary = toPlanSummary(data);
      if (!summary) {
        throw new Error('The plan summary is incomplete');
      }
      return summary;
    },
  });
}

/** What a plan allows that the premium page compares, null being no limit. */
export type PlanNumbers = {
  workouts: number | null;
  versions: number | null;
  addedAlternatives: number | null;
  weeklyPhotos: number | null;
};

/** The free plan's numbers and premium's, which only change with a migration. */
export function usePlanNumbers() {
  return useQuery({
    queryKey: ['plan-numbers'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plan_numbers');
      if (error) {
        throw error;
      }
      const numbers = (plan: Plan): PlanNumbers => {
        const row = data.find((other) => other.plan === plan);
        if (!row) {
          throw new Error(`No numbers for the ${plan} plan`);
        }
        return {
          workouts: row.workouts,
          versions: row.versions,
          addedAlternatives: row.added_alternatives,
          weeklyPhotos: row.weekly_photos,
        };
      };
      return { free: numbers('free'), premium: numbers('premium') };
    },
    staleTime: Infinity,
  });
}
