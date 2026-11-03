import { toPlanSummary } from './plan';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const EMPTY = {
  plan: null,
  billing: null,
  period_end: null,
  week_left: null,
  week_resets_at: null,
  period_left: null,
  period_resets_at: null,
  photos_per_week: null,
  photos_left: null,
  photos_reset_at: null,
};

describe('toPlanSummary', () => {
  it('reads the free plan as its photos', () => {
    expect(
      toPlanSummary({
        ...EMPTY,
        plan: 'free',
        photos_per_week: 2,
        photos_left: 1,
        photos_reset_at: '2026-11-09T00:00:00Z',
      }),
    ).toEqual({
      plan: 'free',
      photos: { perWeek: 2, left: 1, resetsAt: new Date('2026-11-09T00:00:00Z') },
    });
  });

  it('reads a paid plan as its billing, renewal and windows', () => {
    expect(
      toPlanSummary({
        ...EMPTY,
        plan: 'premium',
        billing: 'yearly',
        period_end: '2027-11-02T00:00:00Z',
        week_left: 0.5,
        week_resets_at: '2026-11-09T00:00:00Z',
        period_left: 0.8,
        period_resets_at: '2026-12-02T00:00:00Z',
      }),
    ).toEqual({
      plan: 'premium',
      billing: 'yearly',
      renewsAt: new Date('2027-11-02T00:00:00Z'),
      week: { left: 0.5, resetsAt: new Date('2026-11-09T00:00:00Z') },
      period: { left: 0.8, resetsAt: new Date('2026-12-02T00:00:00Z') },
    });
  });

  it('leaves out a week the plan does not have', () => {
    const summary = toPlanSummary({
      ...EMPTY,
      plan: 'trial',
      billing: 'monthly',
      period_end: '2026-11-10T00:00:00Z',
      period_left: 1,
      period_resets_at: '2026-11-10T00:00:00Z',
    });
    expect(summary).toMatchObject({ plan: 'trial', week: null });
  });

  it('gives nothing for a row missing what its plan needs', () => {
    expect(toPlanSummary({ ...EMPTY, plan: 'free' })).toBeNull();
    expect(toPlanSummary({ ...EMPTY, plan: 'premium', billing: 'yearly' })).toBeNull();
  });
});
