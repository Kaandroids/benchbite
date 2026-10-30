import { supabase } from '@/lib/supabase';

import {
  calculateAchievablePace,
  calculateTargets,
  generatePlan,
  refusedAnswer,
  saveOnboarding,
  type WorkoutPlan,
} from './plan';
import type { OnboardingAnswers } from './types';

jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), functions: { invoke: jest.fn() } },
}));

const rpc = supabase.rpc as jest.Mock;
const invoke = supabase.functions.invoke as jest.Mock;

const ANSWERS: OnboardingAnswers = {
  goal: 'lose_fat',
  consentedPolicyVersion: '2026-10-21',
  sex: 'female',
  birthYear: 1996,
  heightCm: 168,
  weightKg: 72.5,
  targetWeightKg: 65,
  weeklyPaceKg: 0.5,
  activityLevel: 'moderate',
  experience: 'beginner',
  trainingDays: [1, 3, 5],
  setup: 'gym',
  sessionMinutes: 45,
  weightUnit: 'kg',
  heightUnit: 'cm',
};

const PLAN: WorkoutPlan = {
  sessions: [
    {
      weekdays: [1],
      type: 'full_body',
      exercises: [
        {
          exerciseId: 'squat',
          slot: 'squat',
          sets: 3,
          target: { reps: { min: 8, max: 12 } },
          restSeconds: 90,
        },
      ],
      estimatedMinutes: 40,
      time: { warmUp: 300, main: 1800, extras: 300, conditioning: 0 },
      work: { exercises: 0, sets: 0, rest: 0 },
    },
  ],
};

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe('calculateTargets', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 21) });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the answers to calculate_nutrition_targets and maps the result', async () => {
    rpc.mockResolvedValue({
      data: { calories: 1850, protein_g: 130, carbs_g: 190, fat_g: 62 },
      error: null,
    });
    await expect(calculateTargets(ANSWERS)).resolves.toEqual({
      calories: 1850,
      proteinG: 130,
      carbsG: 190,
      fatG: 62,
    });
    expect(rpc).toHaveBeenCalledWith('calculate_nutrition_targets', {
      sex: 'female',
      age: 30,
      height_cm: 168,
      weight_kg: 72.5,
      activity_level: 'moderate',
      training_days_per_week: 3,
      goal: 'lose_fat',
      target_weight_kg: 65,
      weekly_pace_kg: 0.5,
    });
  });

  it('asks for the pace the targets give for the same answers', async () => {
    rpc.mockResolvedValue({ data: 0.45, error: null });
    await expect(calculateAchievablePace(ANSWERS)).resolves.toBe(0.45);
    expect(rpc).toHaveBeenCalledWith(
      'achievable_weekly_pace_kg',
      expect.objectContaining({ weight_kg: 72.5, goal: 'lose_fat', weekly_pace_kg: 0.5 }),
    );
  });

  it('leaves out the target weight and pace when the goal has none', async () => {
    rpc.mockResolvedValue({
      data: { calories: 2100, protein_g: 120, carbs_g: 250, fat_g: 70 },
      error: null,
    });
    const { targetWeightKg: _target, weeklyPaceKg: _pace, ...answers } = ANSWERS;
    await calculateTargets({ ...answers, goal: 'stay_healthy' });
    expect(rpc).toHaveBeenCalledWith(
      'calculate_nutrition_targets',
      expect.objectContaining({
        goal: 'stay_healthy',
        target_weight_kg: undefined,
        weekly_pace_kg: undefined,
      }),
    );
  });

  it('fails rather than showing zero calories when the result has none', async () => {
    rpc.mockResolvedValue({
      data: { calories: null, protein_g: null, carbs_g: null, fat_g: null },
      error: null,
    });
    await expect(calculateTargets(ANSWERS)).rejects.toThrow(
      'The nutrition targets could not be calculated',
    );
  });

  it('turns missing macros into zero', async () => {
    rpc.mockResolvedValue({
      data: { calories: 2200, protein_g: null, carbs_g: null, fat_g: null },
      error: null,
    });
    await expect(calculateTargets(ANSWERS)).resolves.toEqual({
      calories: 2200,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
    });
  });

  it('throws the error the database returns', async () => {
    const error = { code: '22023', message: 'invalid input' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(calculateTargets(ANSWERS)).rejects.toBe(error);
  });

  it.each(['sex', 'birthYear', 'heightCm', 'weightKg', 'activityLevel', 'trainingDays', 'goal'])(
    'refuses to calculate without the %s answer',
    async (key) => {
      const answers = { ...ANSWERS, [key]: undefined };
      await expect(calculateTargets(answers)).rejects.toThrow(
        `The onboarding answer ${key} is missing`,
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );
});

describe('generatePlan', () => {
  it('invokes generate-plan with the training answers', async () => {
    invoke.mockResolvedValue({ data: PLAN, error: null });
    await expect(generatePlan(ANSWERS)).resolves.toBe(PLAN);
    expect(invoke).toHaveBeenCalledWith('generate-plan', {
      body: {
        goal: 'lose_fat',
        experience: 'beginner',
        trainingDays: [1, 3, 5],
        setup: 'gym',
        sessionMinutes: 45,
      },
    });
  });

  it('throws the error the function returns', async () => {
    const error = new Error('Edge Function returned a non-2xx status code');
    invoke.mockResolvedValue({ data: null, error });
    await expect(generatePlan(ANSWERS)).rejects.toBe(error);
  });

  it('throws when the function returns nothing', async () => {
    invoke.mockResolvedValue({ data: null, error: null });
    await expect(generatePlan(ANSWERS)).rejects.toThrow('The plan builder returned nothing');
  });

  it.each(['goal', 'experience', 'trainingDays', 'setup', 'sessionMinutes'])(
    'refuses to build a plan without the %s answer',
    async (key) => {
      await expect(generatePlan({ ...ANSWERS, [key]: undefined })).rejects.toThrow(
        `The onboarding answer ${key} is missing`,
      );
      expect(invoke).not.toHaveBeenCalled();
    },
  );
});

describe('saveOnboarding', () => {
  // Late in the evening on the device, which may be tomorrow on the server.
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 9, 28, 23), doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('saves the answers without the calculated result, and the plan', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const answers: OnboardingAnswers = {
      ...ANSWERS,
      plan: PLAN,
      targets: { calories: 1850, proteinG: 130, carbsG: 190, fatG: 62 },
      achievablePaceKg: 0.45,
      reminderMinutes: 18 * 60,
    };
    await saveOnboarding(answers, PLAN);
    expect(rpc).toHaveBeenCalledWith('complete_onboarding', {
      answers: { ...ANSWERS, today: '2026-10-28' },
      plan: PLAN,
    });
  });

  it('does not change the answers it saves', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const answers: OnboardingAnswers = { ...ANSWERS, plan: PLAN, reminderMinutes: 0 };
    await saveOnboarding(answers, PLAN);
    expect(answers.plan).toBe(PLAN);
    expect(answers.reminderMinutes).toBe(0);
  });

  it('counts an onboarding that was saved before as saved', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'BB001', message: 'already completed' } });
    await expect(saveOnboarding(ANSWERS, PLAN)).resolves.toBeUndefined();
  });

  it('throws any other error', async () => {
    const error = { code: '23514', message: 'check constraint violated' };
    rpc.mockResolvedValue({ data: null, error });
    await expect(saveOnboarding(ANSWERS, PLAN)).rejects.toBe(error);
  });
});

describe('refusedAnswer', () => {
  it('names the answer the server refused, and nothing for other errors', () => {
    expect(refusedAnswer({ code: 'BB002' })).toBe('tooYoung');
    expect(refusedAnswer({ code: 'BB003' })).toBe('noConsent');
    expect(refusedAnswer({ code: 'BB004' })).toBe('daysChanged');
    expect(refusedAnswer({ code: 'BB005' })).toBeNull();
    expect(refusedAnswer(new Error('offline'))).toBeNull();
    expect(refusedAnswer(null)).toBeNull();
  });
});
