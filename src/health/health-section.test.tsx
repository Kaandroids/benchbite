import { fireEvent, render, screen, waitFor } from '@/test/render';

import { isHealthConnected, setHealthConnected } from './connection';
import {
  healthAvailability,
  openHealthStore,
  releaseHealthAccess,
  requestHealthAccess,
  type HealthAvailability,
} from './health';
import { HealthSection } from './health-section';

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
jest.mock('@/providers/session-provider', () => ({ useUserId: () => 'user-a' }));
jest.mock('./health', () => ({
  healthStore: 'appleHealth',
  healthAvailability: jest.fn(),
  requestHealthAccess: jest.fn(),
  releaseHealthAccess: jest.fn(() => Promise.resolve()),
  openHealthStore: jest.fn(),
}));

const available = (availability: HealthAvailability) =>
  jest.mocked(healthAvailability).mockResolvedValue(availability);

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected('user-a', false);
  available('available');
  jest.mocked(requestHealthAccess).mockResolvedValue(true);
});

const row = () => screen.getByRole('button', { name: /Apple Health/ });

it('says what connecting adds, and asks before the system does', async () => {
  await render(<HealthSection />);
  expect(screen.getByText('Not connected')).toBeOnTheScreen();
  expect(
    screen.getByText('Adds the heart rate and calories your watch measured to your workouts.'),
  ).toBeOnTheScreen();

  await fireEvent.press(row());

  expect(await screen.findByText('Read from Apple Health?')).toBeOnTheScreen();
  expect(screen.getByText('Heart rate')).toBeOnTheScreen();
  expect(screen.getByText('Active calories')).toBeOnTheScreen();
  expect(requestHealthAccess).not.toHaveBeenCalled();
});

it('connects once the system allowed it, for this user only', async () => {
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

  expect(requestHealthAccess).toHaveBeenCalled();
  expect(await screen.findByText('Connected')).toBeOnTheScreen();
  expect(isHealthConnected('user-a')).toBe(true);
  expect(isHealthConnected('user-b')).toBe(false);
});

it('connects nothing when the last question is declined', async () => {
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));

  expect(requestHealthAccess).not.toHaveBeenCalled();
  expect(screen.queryByText('Read from Apple Health?')).toBeNull();
  expect(isHealthConnected('user-a')).toBe(false);
});

it('says where to allow it when the system refused', async () => {
  jest.mocked(requestHealthAccess).mockResolvedValue(false);
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

  expect(
    await screen.findByText(
      'Benchbite may not read your heart rate yet. Allow it in the Health app, under Sharing.',
    ),
  ).toBeOnTheScreen();
  expect(isHealthConnected('user-a')).toBe(false);
});

it('points to Google Play when Health Connect is missing', async () => {
  available('notInstalled');
  await render(<HealthSection />);
  await fireEvent.press(row());

  expect(await screen.findByText('Health Connect is needed')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Google Play' }));

  expect(openHealthStore).toHaveBeenCalledWith('notInstalled');
});

it('says so on a device without health data', async () => {
  available('unavailable');
  await render(<HealthSection />);
  await fireEvent.press(row());

  expect(await screen.findByText('This device has no health data to read.')).toBeOnTheScreen();
});

it('disconnects only when asked twice, and gives up what was allowed', async () => {
  setHealthConnected('user-a', true);
  await render(<HealthSection />);
  await fireEvent.press(row());

  await fireEvent.press(await screen.findByRole('button', { name: 'Keep connected' }));
  expect(isHealthConnected('user-a')).toBe(true);

  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect' }));

  await waitFor(() => expect(isHealthConnected('user-a')).toBe(false));
  expect(releaseHealthAccess).toHaveBeenCalled();
  expect(await screen.findByText('Not connected')).toBeOnTheScreen();
});
