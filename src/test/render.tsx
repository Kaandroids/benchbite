// Renders components the way the app does: with translations, the safe area, the gesture
// handler root and a query client of their own. Tests import render, renderHook and screen from
// here instead of from the testing library.
import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render as renderComponent,
  renderHook as renderHookComponent,
  type RenderHookOptions,
  type RenderOptions,
} from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The query clients made for the test running, which are cleared after it. */
const clients = new Set<QueryClient>();

// A query of a shorter gcTime of its own, as the chat's media addresses, leaves a timer to remove
// it once it is unused, which would keep Jest's worker alive after the tests: clearing the cache
// takes the timers with it.
afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
});

/** A query client that fails at once instead of retrying, so error states can be tested. */
export function createTestQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.add(client);
  return client;
}

function wrapperWith(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <SafeAreaProvider initialMetrics={SAFE_AREA}>{children}</SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    );
  };
}

type Options = { queryClient?: QueryClient };

export function render(ui: ReactElement, options?: RenderOptions & Options) {
  const { queryClient = createTestQueryClient(), ...rest } = options ?? {};
  return renderComponent(ui, { wrapper: wrapperWith(queryClient), ...rest });
}

export function renderHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props> & Options,
) {
  const { queryClient = createTestQueryClient(), ...rest } = options ?? {};
  return renderHookComponent(hook, { wrapper: wrapperWith(queryClient), ...rest });
}

export * from '@testing-library/react-native';
