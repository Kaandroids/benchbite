import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { isHealthConnected, setHealthConnected, setReadSync, readSync } from './connection';
import {
  healthAvailability,
  healthStepsAllowed,
  healthStillAllowed,
  healthWeightAllowed,
  installHealthStore,
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
jest.mock('./health', () => ({
  healthStore: 'appleHealth',
  healthAvailability: jest.fn(),
  healthStepsAllowed: jest.fn(),
  healthStillAllowed: jest.fn(),
  healthWeightAllowed: jest.fn(),
  requestHealthAccess: jest.fn(),
  releaseHealthAccess: jest.fn(),
  installHealthStore: jest.fn(),
}));

const available = (availability: HealthAvailability) =>
  jest.mocked(healthAvailability).mockResolvedValue(availability);

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(false);
  setReadSync('weight', null);
  available('available');
  jest.mocked(requestHealthAccess).mockResolvedValue(true);
  jest.mocked(healthStillAllowed).mockResolvedValue(true);
  jest.mocked(healthWeightAllowed).mockResolvedValue(true);
  jest.mocked(healthStepsAllowed).mockResolvedValue(true);
  jest.mocked(releaseHealthAccess).mockResolvedValue();
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
  expect(screen.getByText('Weight')).toBeOnTheScreen();
  expect(requestHealthAccess).not.toHaveBeenCalled();
});

it('connects once the system allowed it', async () => {
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

  expect(requestHealthAccess).toHaveBeenCalled();
  expect(await screen.findByText('Connected')).toBeOnTheScreen();
  expect(isHealthConnected()).toBe(true);
  expect(readSync('weight')).toBe('on');
  expect(readSync('steps')).toBe('on');
});

it('leaves weight to be asked for alone when the system allowed the rest without it', async () => {
  jest.mocked(healthWeightAllowed).mockResolvedValue(false);
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

  expect(await screen.findByText('Connected')).toBeOnTheScreen();
  expect(readSync('weight')).toBeNull();
});

it('connects nothing when the last question is declined', async () => {
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Not now' }));

  expect(requestHealthAccess).not.toHaveBeenCalled();
  expect(screen.queryByText('Read from Apple Health?')).toBeNull();
  expect(isHealthConnected()).toBe(false);
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
  expect(isHealthConnected()).toBe(false);
});

it('says so when asking fails, and stays unconnected', async () => {
  jest.mocked(requestHealthAccess).mockRejectedValue(new Error('no entitlement'));
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue' }));

  expect(await screen.findByText('That didn’t work. Try again in a moment.')).toBeOnTheScreen();
  expect(isHealthConnected()).toBe(false);
});

it('points to Google Play when Health Connect is missing or old', async () => {
  available('missing');
  await render(<HealthSection />);
  await fireEvent.press(row());

  expect(await screen.findByText('Health Connect is needed')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Open Google Play' }));

  expect(installHealthStore).toHaveBeenCalled();
});

it('says so on a device without health data', async () => {
  available('unavailable');
  await render(<HealthSection />);
  await fireEvent.press(row());

  expect(await screen.findByText('This device has no health data to read.')).toBeOnTheScreen();
});

it('disconnects only when asked twice, and gives up what was allowed', async () => {
  setHealthConnected(true);
  await render(<HealthSection />);
  await fireEvent.press(row());

  await fireEvent.press(await screen.findByRole('button', { name: 'Keep connected' }));
  expect(isHealthConnected()).toBe(true);

  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect' }));

  await waitFor(() => expect(isHealthConnected()).toBe(false));
  expect(releaseHealthAccess).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Not connected')).toBeOnTheScreen();
});

it('says where to take access back when giving it up failed', async () => {
  setHealthConnected(true);
  jest.mocked(releaseHealthAccess).mockRejectedValue(new Error('busy'));
  await render(<HealthSection />);
  await fireEvent.press(row());
  await fireEvent.press(await screen.findByRole('button', { name: 'Disconnect' }));

  expect(
    await screen.findByText(
      'Benchbite stopped reading, but Health Connect still allows it. Take it back in Health Connect.',
    ),
  ).toBeOnTheScreen();
  expect(isHealthConnected()).toBe(false);
});

it('lets go of a connection the system has taken back', async () => {
  setHealthConnected(true);
  jest.mocked(healthStillAllowed).mockResolvedValue(false);
  await render(<HealthSection />);

  expect(await screen.findByText('Not connected')).toBeOnTheScreen();
  await act(async () => {});
  expect(isHealthConnected()).toBe(false);
});
