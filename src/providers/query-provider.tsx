import {
  focusManager,
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { isDbError, type DbError } from '@/lib/errors';
import { reportError } from '@/lib/reporting';

import { useSession } from './session-provider';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** What failed, in the app's words, when the mutation fails: "Could not save the workout". */
      where: string;
      /** The database's refusals its screen explains, which are then no error to report. */
      expects?: readonly DbError[];
    };
  }
}

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
    // Every request that fails is reported (#550, ADR 0151), as screens show their own message and
    // go on; reportError leaves out what the app expects, as no network. A query is named by the
    // first part of its key, which names what it loads; a mutation by its `meta.where`, which a
    // lint rule asks every one for.
    queryCache: new QueryCache({
      onError: (error, query) => reportError(`Could not load ${String(query.queryKey[0])}`, error),
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const { where = 'Could not save a change', expects = [] } = mutation.meta ?? {};
        if (!expects.some((name) => isDbError(error, name))) {
          reportError(where, error);
        }
      },
    }),
    defaultOptions: {
      queries: {
        // The user's data only changes through the app, so it stays fresh for a while instead of
        // being loaded again on every screen.
        staleTime: 60_000,
        // As by default, but asking again changes nothing for a build the backend refuses as no
        // longer supported (ADR 0157).
        retry: (failures, error) => failures < 3 && !isDbError(error, 'unsupportedVersion'),
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
