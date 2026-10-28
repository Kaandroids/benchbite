import { answersFrom, paramsOf, stepsFor } from './recalculate';
import type { TargetBasis } from './targets';

// Saved: losing fat from 80 to 75 kg at 0.5 kg a week, lightly active, 180 cm tall.
const basis: TargetBasis = {
  goal: 'lose_fat',
  targetWeightKg: 75,
  weeklyPaceKg: 0.5,
  activity: 'light',
  heightCm: 180,
};

describe('stepsFor', () => {
  it('asks for a target and a pace only for a goal that changes the weight', () => {
    expect(stepsFor('lose_fat')).toEqual(['goal', 'target', 'activity', 'result']);
    expect(stepsFor('build_muscle')).toEqual(['goal', 'target', 'activity', 'result']);
    expect(stepsFor('get_stronger')).toEqual(['goal', 'activity', 'result']);
    expect(stepsFor('stay_healthy')).toEqual(['goal', 'activity', 'result']);
  });
});

describe('answersFrom', () => {
  it('starts from the saved answers', () => {
    expect(answersFrom({}, basis, 80)).toEqual({
      goal: 'lose_fat',
      targetWeightKg: 75,
      weeklyPaceKg: 0.5,
      activity: 'light',
    });
  });

  it('takes the answers given so far', () => {
    expect(
      answersFrom(
        { goal: 'lose_fat', target: '72.5', pace: '0.75', activity: 'active' },
        basis,
        80,
      ),
    ).toEqual({ goal: 'lose_fat', targetWeightKg: 72.5, weeklyPaceKg: 0.75, activity: 'active' });
  });

  it('drops the saved target and pace for another goal', () => {
    expect(answersFrom({ goal: 'build_muscle' }, basis, 80)).toEqual({
      goal: 'build_muscle',
      targetWeightKg: null,
      weeklyPaceKg: null,
      activity: 'light',
    });
  });

  it('has no target or pace for a goal that keeps the weight', () => {
    expect(answersFrom({ goal: 'stay_healthy', target: '70', pace: '0.5' }, basis, 80)).toEqual({
      goal: 'stay_healthy',
      targetWeightKg: null,
      weeklyPaceKg: null,
      activity: 'light',
    });
  });

  it('drops a saved target the weight has reached', () => {
    expect(answersFrom({}, basis, 74.6)).toMatchObject({
      targetWeightKg: null,
      weeklyPaceKg: null,
    });
  });

  it('ignores parameters the app did not write', () => {
    expect(
      answersFrom({ goal: 'fly', target: 'abc', pace: '-1', activity: 'asleep' }, basis, 80),
    ).toEqual({ goal: 'lose_fat', targetWeightKg: 75, weeklyPaceKg: 0.5, activity: 'light' });
    expect(answersFrom({ goal: 'lose_fat', target: '74', pace: '0' }, basis, 80)).toMatchObject({
      targetWeightKg: 74,
      weeklyPaceKg: null,
    });
  });
});

describe('paramsOf', () => {
  it('carries the answers to the next step and back', () => {
    const answers = {
      goal: 'build_muscle',
      targetWeightKg: 83,
      weeklyPaceKg: 0.25,
      activity: 'moderate',
    } as const;
    expect(paramsOf(answers)).toEqual({
      goal: 'build_muscle',
      target: '83',
      pace: '0.25',
      activity: 'moderate',
    });
    expect(answersFrom(paramsOf(answers), basis, 80)).toEqual(answers);
  });

  it('leaves out what a goal that keeps the weight does not have', () => {
    expect(
      paramsOf({
        goal: 'stay_healthy',
        targetWeightKg: null,
        weeklyPaceKg: null,
        activity: 'light',
      }),
    ).toEqual({ goal: 'stay_healthy', activity: 'light' });
  });
});
