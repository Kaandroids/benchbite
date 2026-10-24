import { supabase } from '@/lib/supabase';

/** The URL of an exercise picture in the public exercise-images bucket. */
export function exerciseImageUrl(path: string): string {
  return supabase.storage.from('exercise-images').getPublicUrl(path).data.publicUrl;
}
