import { Pressable, Text } from 'react-native';

import { recentLogs } from '@/history/history';
import { supabase } from '@/lib/supabase';
import { fireEvent, render, screen, waitFor } from '@/test/render';

import { isHealthConnected, setHealthConnected, setReadSync } from './connection';
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

let consentHolds = true;

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
  setReadSync('weight', null);
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
  consentHolds = true;
  jest.mocked(supabase.rpc).mockImplementation(((name: string) =>
    Promise.resolve({
      data: name === 'my_health_app_consent' ? consentHolds : 1,
      error: null,
    })) as never);
});

it('brings in the weights as soon as the store is connected', async () => {
  await render(
    <>
      <HealthCatchUp />
      <Connect />
    </>,
  );

  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('import_weights', expect.anything()),
  );
});

it('records the consent before the system asks', async () => {
  await render(<Connect />);
  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() => expect(requestAccess).toHaveBeenCalled());
  expect(supabase.rpc).toHaveBeenCalledWith(
    'give_health_app_consent',
    expect.objectContaining({ consent_version: '2026-11-23' }),
  );
  const [given] = jest.mocked(supabase.rpc).mock.invocationCallOrder;
  const [asked] = jest.mocked(requestAccess).mock.invocationCallOrder;
  expect(given).toBeLessThan(asked!);
});

it('asks the system nothing when the consent was not recorded', async () => {
  jest
    .mocked(supabase.rpc)
    .mockResolvedValue({ data: null, error: { code: 'BB067', message: 'no' } } as never);
  await render(<Connect />);
  await fireEvent.press(screen.getByRole('button', { name: 'Connect' }));

  await waitFor(() =>
    expect(supabase.rpc).toHaveBeenCalledWith('give_health_app_consent', expect.anything()),
  );
  expect(requestAccess).not.toHaveBeenCalled();
});

it('lets go of a connection made before its consent was asked for, and reads nothing', async () => {
  consentHolds = false;
  setHealthConnected(true);
  await render(<HealthCatchUp />);

  await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('my_health_app_consent'));
  await waitFor(() => expect(isHealthConnected()).toBe(false));
  expect(recentLogs).not.toHaveBeenCalled();
  expect(weightsSince).not.toHaveBeenCalled();
});
