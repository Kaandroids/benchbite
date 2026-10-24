import { isDbError } from './errors';

describe('isDbError', () => {
  it('tells the errors the database refuses a request with by their code', () => {
    expect(isDbError({ code: 'BB019' }, 'moveDoesNotFit')).toBe(true);
    expect(isDbError({ code: 'BB009' }, 'moveDoesNotFit')).toBe(false);
    expect(isDbError(new Error('offline'), 'workoutLimit')).toBe(false);
    expect(isDbError(null, 'workoutLimit')).toBe(false);
  });
});
