// The video of how an exercise goes (ADR 0176): a small looping MP4 and its poster in the public
// exercise-media bucket, shown in place of the muscle map. Most exercises have none yet.
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

const BUCKET = 'exercise-media';
const VIDEO_KEY = ['exercise-video'];

/** An exercise's video and its poster, as addresses the app loads them from. */
export type ExerciseVideo = { video: string; poster: string };

const publicUrl = (path: string) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** An exercise's video, or null when it has none. A new batch shows from the app's next start. */
export async function fetchExerciseVideo(id: string): Promise<ExerciseVideo | null> {
  const { data, error } = await supabase
    .from('exercise_videos')
    .select('video_path, poster_path')
    .eq('exercise_id', id)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ? { video: publicUrl(data.video_path), poster: publicUrl(data.poster_path) } : null;
}

export function useExerciseVideo(id: string) {
  return useQuery({
    queryKey: [...VIDEO_KEY, id],
    queryFn: () => fetchExerciseVideo(id),
    staleTime: Infinity,
  });
}
