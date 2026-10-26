import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';

/** The longest name `profiles.display_name` accepts. */
export const MAX_DISPLAY_NAME_LENGTH = 30;

const QUERY_KEY = ['profile', 'display-name'];

/**
 * The name to save for what was typed: without the spaces around it, or none if nothing is left.
 * The column refuses control characters, which a pasted tab or line break would bring, so they
 * become spaces.
 */
export function displayNameOf(text: string): string | null {
  const name = text.replace(/\p{Cc}+/gu, ' ').trim();
  return name === '' ? null : name;
}

/** What the signed-in user wants to be called, or null if they gave no name. */
export function useDisplayName() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('profiles').select('display_name').maybeSingle();
      if (error) {
        throw error;
      }
      return data?.display_name ?? null;
    },
  });
}

/** Changes the signed-in user's name; null removes it. */
export function useSetDisplayName() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (name: string | null) => {
      if (session.status !== 'ready') {
        throw new Error('Not signed in');
      }
      const { error } = await supabase
        .from('profiles')
        .update({ display_name: name })
        .eq('user_id', session.session.user.id);
      if (error) {
        throw error;
      }
      return name;
    },
    onSuccess: (name) => queryClient.setQueryData(QUERY_KEY, name),
  });
}
