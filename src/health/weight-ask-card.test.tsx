import { fireEvent, render, screen, waitFor } from '@/test/render';

import { setHealthConnected, setWeightSync, weightSync } from './connection';
import { requestHealthWeightAccess } from './health';
import { useWeightSyncAsk } from './use-weight-sync-ask';
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

function AskCard() {
  return <WeightAskCard ask={useWeightSyncAsk()} />;
}

const TITLE = 'Your weight from Apple Health';

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  setWeightSync(null);
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(true);
  jest.mocked(importHealthWeights).mockResolvedValue(true);
});

it('asks for weight, then reads it and hides', async () => {
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(weightSync()).toBe('on');
  expect(importHealthWeights).toHaveBeenCalled();
});

it('reads nothing when weight was not allowed', async () => {
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(false);
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(weightSync()).toBe('off'));
  expect(importHealthWeights).not.toHaveBeenCalled();
});

it('hides for good on not now', async () => {
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(weightSync()).toBe('off');
});

it('shows only to a user who connected the store and was not asked yet', async () => {
  setWeightSync('on');
  await render(<AskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();

  setWeightSync(null);
  setHealthConnected(false);
  await render(<AskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();
});
