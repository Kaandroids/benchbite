import { functionRefusal, isDbError } from './errors';

describe('isDbError', () => {
  it('tells the errors the database refuses a request with by their code', () => {
    expect(isDbError({ code: 'BB019' }, 'moveDoesNotFit')).toBe(true);
    expect(isDbError({ code: 'BB009' }, 'moveDoesNotFit')).toBe(false);
    expect(isDbError(new Error('offline'), 'workoutLimit')).toBe(false);
    expect(isDbError(null, 'workoutLimit')).toBe(false);
  });
});

describe('functionRefusal', () => {
  it('reads the reason an Edge Function gave', () => {
    expect(functionRefusal({ error: 'wrong_code' })).toBe('wrong_code');
  });

  it('finds none in an answer without one', () => {
    for (const body of [null, 'wrong_code', {}, { error: 3 }, ['error']]) {
      expect(functionRefusal(body)).toBeUndefined();
    }
  });
});
