import { fireEvent, render, screen, waitFor } from '@/test/render';

import { setHealthConnected, setWeightReading, weightReading } from './connection';
import { requestHealthWeightAccess } from './health';
import { WeightAskCard } from './weight-ask-card';
import { importHealthWeights } from './weight-import';

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
  requestHealthWeightAccess: jest.fn(),
}));
jest.mock('./weight-import', () => ({ importHealthWeights: jest.fn() }));

const TITLE = 'Your weight from Apple Health';

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  setWeightReading(null);
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(true);
  jest.mocked(importHealthWeights).mockResolvedValue(true);
});

it('asks for weight, then reads it and hides', async () => {
  await render(<WeightAskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(weightReading()).toBe('on');
  expect(importHealthWeights).toHaveBeenCalled();
});

it('reads nothing when weight was not allowed', async () => {
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(false);
  await render(<WeightAskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(weightReading()).toBe('off'));
  expect(importHealthWeights).not.toHaveBeenCalled();
});

it('hides for good on not now', async () => {
  await render(<WeightAskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(weightReading()).toBe('off');
});

it('shows only to a user who connected the store and was not asked yet', async () => {
  setWeightReading('on');
  await render(<WeightAskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();

  setWeightReading(null);
  setHealthConnected(false);
  await render(<WeightAskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();
});
