import { isIncluded, nextStep, previousStep, pruneAnswers } from './steps';

describe('steps', () => {
  it('skips the target weight and pace unless the goal changes the weight', () => {
    expect(isIncluded('pace', { goal: 'stay_healthy' })).toBe(false);
    expect(isIncluded('pace', { goal: 'lose_fat' })).toBe(true);
    expect(nextStep('weight', { goal: 'stay_healthy' })).toBe('activity');
    expect(previousStep('activity', { goal: 'stay_healthy' })).toBe('weight');
  });

  it('drops answers of steps that left the flow', () => {
    expect(pruneAnswers({ goal: 'stay_healthy', targetWeightKg: 70, weeklyPaceKg: 0.5 })).toEqual({
      goal: 'stay_healthy',
    });
  });
});
