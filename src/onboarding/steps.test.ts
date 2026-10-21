import {
  STEPS,
  canGoBackFrom,
  isIncluded,
  isPassing,
  isStep,
  nextStep,
  previousStep,
  progressOf,
  pruneAnswers,
  type Step,
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
    expect(previousStep('goal', {})).toBe('welcome');
  });

  // Regression: going back from the plan showed the finished building screen, which had nothing
  // left to do and no way on.
  it('skips the building step when going back', () => {
    expect(isPassing('building')).toBe(true);
    expect(nextStep('session-length', {})).toBe('building');
    expect(previousStep('plan', {})).toBe('session-length');
  });

  it('has no way back from the summary, which follows the saved onboarding', () => {
    expect(canGoBackFrom('summary')).toBe(false);
    expect(previousStep('summary', {})).toBeNull();
    expect(canGoBackFrom('reminders')).toBe(true);
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

  it('measures progress from 0 on the first step to 1 on the last', () => {
    expect(progressOf('welcome')).toBe(0);
    expect(progressOf('summary')).toBe(1);
    expect(progressOf('goal')).toBeCloseTo(1 / 19);
    expect(progressOf('target-weight')).toBeCloseTo(8 / 19);
    expect(progressOf('activity')).toBeGreaterThan(progressOf('weight'));
  });
});
