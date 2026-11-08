import { Pressable, Text } from 'react-native';

import { recentLogs } from '@/history/history';
import { supabase } from '@/lib/supabase';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { setHealthConnected, setWeightSync } from './connection';
import { HealthCatchUp } from './health-catch-up';
import { requestAccess, stillAllowed, weightAllowed, weightsSince } from './platform';
import { useHealthConnection } from './use-health-connection';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});
jest.mock('@/lib/supabase', () => ({
  supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));
jest.mock('@/history/history', () => ({ LOGS_KEY: ['workout-logs'], recentLogs: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-1' }));

function Connect() {
  const { connect } = useHealthConnection();
  return (
    <Pressable accessibilityRole="button" onPress={connect}>
      <Text>Connect</Text>
    </Pressable>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(false);
  setWeightSync(null);
  jest.mocked(requestAccess).mockResolvedValue(true);
  jest.mocked(stillAllowed).mockResolvedValue(true);
  jest.mocked(weightAllowed).mockResolvedValue(true);
  jest.mocked(recentLogs).mockResolvedValue([]);
  jest
    .mocked(weightsSince)
    .mockResolvedValue([{ at: new Date(), weightKg: 84.4, source: 'Withings' }] as never);
  jest
    .mocked(supabase.auth.getSession)
    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } }, error: null } as never);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: 1, error: null } as never);
});

it('brings in the weights as soon as the store is connected', async () => {
  await render(
    <>
      <HealthCatchUp />
      <Connect />
    </>,
  );

  fireEvent.press(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('import_weights', expect.anything()),
  );
});
