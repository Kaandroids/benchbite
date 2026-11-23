import { trainedMuscles } from './trained-muscles';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('trainedMuscles', () => {
  const exercise = (primaryMuscles: string[], secondaryMuscles: string[] = []) =>
    ({ primaryMuscles, secondaryMuscles }) as never;

  it('joins what the exercises train first, then what only helps', () => {
    expect(
      trainedMuscles([
        exercise(['quadriceps'], ['glutes', 'calves']),
        exercise(['abdominals']),
        exercise(['quadriceps'], ['hamstrings']),
      ]),
    ).toEqual({
      primary: ['quadriceps', 'abdominals'],
      secondary: ['glutes', 'calves', 'hamstrings'],
    });
  });

  it('leaves out of the helpers what another exercise trains first', () => {
    expect(trainedMuscles([exercise(['chest'], ['triceps']), exercise(['triceps'])])).toEqual({
      primary: ['chest', 'triceps'],
      secondary: [],
    });
  });

  it('counts unknown exercises for nothing', () => {
    expect(trainedMuscles([undefined, exercise(['lats'])])).toEqual({
      primary: ['lats'],
      secondary: [],
    });
    expect(trainedMuscles([])).toEqual({ primary: [], secondary: [] });
  });
});
