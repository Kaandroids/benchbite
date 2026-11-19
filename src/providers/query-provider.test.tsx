import { useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';

import { cleanup, render, screen } from '@/test/render';
import { sessionValue } from '@/test/context-mocks';

import { QueryProvider } from './query-provider';
import { useSession } from './session-provider';

jest.mock('./session-provider', () => ({ useSession: jest.fn() }));

function signIn(userId: string) {
  jest.mocked(useSession).mockReturnValue(sessionValue(userId));
}

/** Shows whose data the cache holds; each user loads their own name once. */
function Owner() {
  const session = useSession();
  const userId = session.status === 'ready' ? session.session.user.id : '';
  const { data } = useQuery({ queryKey: ['owner'], queryFn: () => userId, staleTime: Infinity });
  return <Text>{data ? `Data of ${data}` : 'Loading'}</Text>;
}

describe('QueryProvider', () => {
  // The app's query client removes unused data after a few minutes; fake timers keep that timer
  // from holding Jest open. It is set as the screen unmounts, which the testing library does after
  // this file's own afterEach, so the screen is unmounted here, while the timers are still fake.
  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    await cleanup();
    jest.useRealTimers();
  });

  it("never shows a previous user's data to the next one", async () => {
    signIn('guest-1');
    const app = await render(
      <QueryProvider>
        <Owner />
      </QueryProvider>,
    );
    expect(await screen.findByText('Data of guest-1')).toBeOnTheScreen();

    signIn('guest-2');
    await app.rerender(
      <QueryProvider>
        <Owner />
      </QueryProvider>,
    );
    expect(await screen.findByText('Data of guest-2')).toBeOnTheScreen();
    expect(screen.queryByText('Data of guest-1')).not.toBeOnTheScreen();
  });
});
