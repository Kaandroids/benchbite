import { supabase } from '@/lib/supabase';

import { fetchExerciseVideo } from './video';

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), storage: { from: jest.fn() } },
}));

function answer(result: { data: unknown; error: unknown }) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
  };
  jest.mocked(supabase.from).mockReturnValue(query as never);
  jest.mocked(supabase.storage.from).mockReturnValue({
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media.test/${path}` } }),
  } as never);
  return query;
}

it('gives the video and poster of an exercise as public addresses', async () => {
  const query = answer({
    data: { video_path: 'Barbell_Squat/0123.mp4', poster_path: 'Barbell_Squat/0123.jpg' },
    error: null,
  });
  await expect(fetchExerciseVideo('Barbell_Squat')).resolves.toEqual({
    video: 'https://media.test/Barbell_Squat/0123.mp4',
    poster: 'https://media.test/Barbell_Squat/0123.jpg',
  });
  expect(supabase.from).toHaveBeenCalledWith('exercise_videos');
  expect(query.eq).toHaveBeenCalledWith('exercise_id', 'Barbell_Squat');
  expect(supabase.storage.from).toHaveBeenCalledWith('exercise-media');
});

it('gives none for an exercise without a video', async () => {
  answer({ data: null, error: null });
  await expect(fetchExerciseVideo('Plank')).resolves.toBeNull();
});

it('fails when the video cannot be read', async () => {
  answer({ data: null, error: new Error('offline') });
  await expect(fetchExerciseVideo('Plank')).rejects.toThrow('offline');
});
