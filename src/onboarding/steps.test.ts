import {
  canGoBackFrom,
  isIncluded,
  isPassing,
  isStep,
  nextStep,
  previousStep,
  progressOf,
  pruneAnswers,
  type Step,
  STEPS,
  stepsBetween,
} from './steps';

describe('steps', () => {
  it('runs from the welcome to the summary with the body data before the training', () => {
    expect(STEPS[0]).toBe('welcome');
    expect(STEPS[STEPS.length - 1]).toBe('summary');
    expect(STEPS.indexOf('consent')).toBeLessThan(STEPS.indexOf('sex'));
    expect(STEPS.indexOf('weight')).toBeLessThan(STEPS.indexOf('target-weight'));
    expect(STEPS.indexOf('target-weight')).toBeLessThan(STEPS.indexOf('pace'));
    expect(STEPS.indexOf('pace')).toBeLessThan(STEPS.indexOf('activity'));
    expect(STEPS.indexOf('building')).toBeLessThan(STEPS.indexOf('plan'));
    expect(new Set(STEPS).size).toBe(STEPS.length);
  });

  it('recognises step names and rejects anything else', () => {
    expect(isStep('welcome')).toBe(true);
    expect(isStep('target-weight')).toBe(true);
    expect(isStep('summary')).toBe(true);
    expect(isStep('')).toBe(false);
    expect(isStep('Welcome')).toBe(false);
    expect(isStep('target_weight')).toBe(false);
  });

  it('skips the target weight and pace unless the goal changes the weight', () => {
    expect(isIncluded('pace', { goal: 'stay_healthy' })).toBe(false);
    expect(isIncluded('pace', { goal: 'lose_fat' })).toBe(true);
    expect(nextStep('weight', { goal: 'stay_healthy' })).toBe('activity');
    expect(previousStep('activity', { goal: 'stay_healthy' })).toBe('weight');
  });

  it('includes the target weight and pace for losing fat and building muscle', () => {
    for (const goal of ['lose_fat', 'build_muscle'] as const) {
      expect(isIncluded('target-weight', { goal })).toBe(true);
      expect(isIncluded('pace', { goal })).toBe(true);
      expect(nextStep('weight', { goal })).toBe('target-weight');
      expect(nextStep('target-weight', { goal })).toBe('pace');
      expect(previousStep('activity', { goal })).toBe('pace');
    }
  });

  it('leaves out the target weight and pace before a goal is chosen', () => {
    expect(isIncluded('target-weight', {})).toBe(false);
    expect(isIncluded('pace', {})).toBe(false);
  });

  it('includes every other step whatever the answers', () => {
    const always = STEPS.filter((step) => step !== 'target-weight' && step !== 'pace');
    for (const step of always) {
      expect(isIncluded(step, {})).toBe(true);
      expect(isIncluded(step, { goal: 'stay_healthy' })).toBe(true);
    }
  });

  it('walks through every step in order when nothing is skipped', () => {
    const answers = { goal: 'lose_fat' } as const;
    const visited: Step[] = [];
    for (let step: Step | null = 'welcome'; step; step = nextStep(step, answers)) {
      visited.push(step);
    }
    expect(visited).toEqual([...STEPS]);
  });

  it('has no step after the summary and none before the welcome', () => {
    expect(nextStep('summary', {})).toBeNull();
    expect(previousStep('welcome', {})).toBeNull();
    expect(nextStep('reminders', {})).toBe('summary');
    expect(previousStep('goal', {})).toBe('nickname');
    expect(previousStep('nickname', {})).toBe('welcome');
  });

  // Regression: going back from the plan showed the finished building screen, which had nothing
  // left to do and no way on.
  it('skips the building step when going back', () => {
    expect(isPassing('building')).toBe(true);
    expect(nextStep('session-length', {})).toBe('building');
    expect(previousStep('plan', {})).toBe('session-length');
  });

  it('has no way back once the plan step saved the onboarding', () => {
    expect(canGoBackFrom('plan')).toBe(true);
    expect(canGoBackFrom('reminders')).toBe(false);
    expect(previousStep('reminders', {})).toBeNull();
    expect(canGoBackFrom('summary')).toBe(false);
    expect(previousStep('summary', {})).toBeNull();
  });

  it('drops answers of steps that left the flow', () => {
    expect(pruneAnswers({ goal: 'stay_healthy', targetWeightKg: 70, weeklyPaceKg: 0.5 })).toEqual({
      goal: 'stay_healthy',
    });
  });

  it('keeps the target weight and pace while the goal changes the weight', () => {
    const answers = { goal: 'build_muscle', targetWeightKg: 80, weeklyPaceKg: 0.25 } as const;
    expect(pruneAnswers(answers)).toEqual(answers);
  });

  it('does not change the answers it prunes', () => {
    const answers = { goal: 'stay_healthy', targetWeightKg: 70 } as const;
    pruneAnswers(answers);
    expect(answers).toEqual({ goal: 'stay_healthy', targetWeightKg: 70 });
  });

  it('measures progress within each section, counting the step itself', () => {
    expect(progressOf('welcome')).toMatchObject({ current: 0, value: 0 });
    expect(progressOf('nickname')).toMatchObject({ current: 0, value: 1 / 11 });
    expect(progressOf('activity')).toMatchObject({ current: 0, value: 1 });
    expect(progressOf('training-intro')).toMatchObject({ current: 1, value: 1 / 5 });
    expect(progressOf('session-length')).toMatchObject({ current: 1, value: 1 });
    expect(progressOf('building')).toMatchObject({ current: 2, value: 1 / 4 });
    expect(progressOf('summary')).toMatchObject({ current: 2, value: 1 });
  });

  it('measures the whole flow against every step for screen readers', () => {
    expect(progressOf('welcome').overall).toBe(0);
    expect(progressOf('activity').overall).toBeCloseTo(11 / 20);
    expect(progressOf('training-intro').overall).toBeCloseTo(12 / 20);
    expect(progressOf('summary').overall).toBe(1);
  });

  it('moves forward with every step', () => {
    const overall = STEPS.map((step) => {
      const { current, value } = progressOf(step);
      return current + value;
    });
    for (let index = 1; index < overall.length; index++) {
      expect(overall[index]).toBeGreaterThan(overall[index - 1]!);
    }
  });

  it('lists the steps of the flow between two steps', () => {
    expect(stepsBetween('training-intro', 'building', {})).toEqual([
      'experience',
      'training-days',
      'setup',
      'session-length',
    ]);
    expect(stepsBetween('weight', 'activity', { goal: 'stay_healthy' })).toEqual([]);
    expect(stepsBetween('weight', 'activity', { goal: 'lose_fat' })).toEqual([
      'target-weight',
      'pace',
    ]);
  });
});
