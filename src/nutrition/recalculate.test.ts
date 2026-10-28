import {
  answerChanges,
  answersFrom,
  paramsOf,
  stepsFor,
  targetsFromWas,
  wasParam,
} from './recalculate';
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
    expect(stepsFor('lose_fat')).toEqual(['goal', 'target', 'activity', 'review']);
    expect(stepsFor('build_muscle')).toEqual(['goal', 'target', 'activity', 'review']);
    expect(stepsFor('get_stronger')).toEqual(['goal', 'activity', 'review']);
    expect(stepsFor('stay_healthy')).toEqual(['goal', 'activity', 'review']);
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

describe('a target from the parameters', () => {
  it('is checked as the target step checks it', () => {
    // Below a healthy weight for 180 cm, on the wrong side, and stored as the current weight.
    for (const target of ['30', '85', '79.96']) {
      expect(answersFrom({ goal: 'lose_fat', target, pace: '0.9' }, basis, 80)).toMatchObject({
        targetWeightKg: 75,
        weeklyPaceKg: 0.5,
      });
    }
    expect(
      answersFrom({ goal: 'build_muscle', target: '70', pace: '0.25' }, basis, 80),
    ).toMatchObject({ targetWeightKg: null, weeklyPaceKg: null });
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

describe('answerChanges', () => {
  const same = {
    goal: 'lose_fat',
    targetWeightKg: 75,
    weeklyPaceKg: 0.5,
    activity: 'light',
  } as const;

  it('lists nothing when the answers are the saved ones', () => {
    expect(answerChanges(basis, same)).toEqual([]);
  });

  it('compares the target and pace as they are stored', () => {
    // 165.3 lb back in kilograms, and a pace a fraction off from pounds.
    expect(answerChanges(basis, { ...same, targetWeightKg: 74.98, weeklyPaceKg: 0.501 })).toEqual(
      [],
    );
  });

  it('lists each changed answer with its saved value', () => {
    expect(
      answerChanges(basis, {
        goal: 'lose_fat',
        targetWeightKg: 72,
        weeklyPaceKg: 0.75,
        activity: 'active',
      }),
    ).toEqual([
      { key: 'target', from: 75, to: 72 },
      { key: 'pace', from: 0.5, to: 0.75 },
      { key: 'activity', from: 'light', to: 'active' },
    ]);
  });

  it('lists only the goal when the new one keeps the weight', () => {
    expect(
      answerChanges(basis, {
        goal: 'stay_healthy',
        targetWeightKg: null,
        weeklyPaceKg: null,
        activity: 'light',
      }),
    ).toEqual([{ key: 'goal', from: 'lose_fat', to: 'stay_healthy' }]);
  });

  it('lists a target and pace that were not there before without a saved value', () => {
    const keeping = {
      ...basis,
      goal: 'stay_healthy',
      targetWeightKg: null,
      weeklyPaceKg: null,
    } as const;
    expect(
      answerChanges(keeping, {
        goal: 'build_muscle',
        targetWeightKg: 83,
        weeklyPaceKg: 0.25,
        activity: 'light',
      }),
    ).toEqual([
      { key: 'goal', from: 'stay_healthy', to: 'build_muscle' },
      { key: 'target', from: null, to: 83 },
      { key: 'pace', from: null, to: 0.25 },
    ]);
  });
});

describe('the targets before saving', () => {
  it('go to the page after saving and come back', () => {
    const targets = { calories: 2500, proteinG: 150, carbsG: 300, fatG: 70 };
    expect(wasParam(targets)).toBe('2500,150,300,70');
    expect(targetsFromWas(wasParam(targets))).toEqual(targets);
  });

  it("are left out when the parameter is not the app's", () => {
    expect(targetsFromWas(undefined)).toBeNull();
    expect(targetsFromWas('2500,150')).toBeNull();
    expect(targetsFromWas('2500,150,x,70')).toBeNull();
    expect(targetsFromWas('2500,150,-1,70')).toBeNull();
  });
});
