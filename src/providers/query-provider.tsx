import {
  focusManager,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { reportError } from '@/lib/reporting';

import { useSession } from './session-provider';

// React Native has no window focus events. Data counts as refocused when the app returns to the
// foreground, so screens show what changed elsewhere, for example on another device.
focusManager.setEventListener((setFocused) => {
  const subscription = AppState.addEventListener('change', (state) => {
    if (Platform.OS !== 'web') {
      setFocused(state === 'active');
    }
  });
  return () => subscription.remove();
});

export function createQueryClient() {
  return new QueryClient({
    // Every request that fails is reported (#550), as screens show their own message and go on;
    // reportError leaves out those the app expects, as no network. A query is named by the first
    // part of its key, which names what it loads.
    queryCache: new QueryCache({
      onError: (error, query) => reportError(`Could not load ${String(query.queryKey[0])}`, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) =>
        reportError(
          `Could not save ${String(mutation.options.mutationKey?.[0] ?? 'a change')}`,
          error,
        ),
    }),
    defaultOptions: {
      queries: {
        // The user's data only changes through the app, so it stays fresh for a while instead of
        // being loaded again on every screen.
        staleTime: 60_000,
      },
    },
  });
}

/**
 * Caches the signed-in user's data from Supabase. Each user gets a client of their own, so data
 * of a guest account that was replaced never shows up for the next one.
 */
export function QueryProvider({ children }: PropsWithChildren) {
  const sessionState = useSession();
  const userId = sessionState.status === 'ready' ? sessionState.session.user.id : null;
  return <UserQueryProvider key={userId ?? 'signed-out'}>{children}</UserQueryProvider>;
}

function UserQueryProvider({ children }: PropsWithChildren) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
