import { fireEvent, render, screen, waitFor } from '@/test/render';

import { setHealthConnected, setReadSync, readSync } from './connection';
import {
  requestHealthStepsAccess,
  requestHealthWeightAccess,
  requestHealthWorkoutsAccess,
} from './health';
import { importOutsideWorkouts } from './outside-workouts-import';
import { ReadAskCard } from './read-ask-card';
import { useReadAsk } from './use-read-ask';
import { importHealthSteps } from './steps-import';
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
  requestHealthStepsAccess: jest.fn(),
  requestHealthWeightAccess: jest.fn(),
  requestHealthWorkoutsAccess: jest.fn(),
}));
jest.mock('./weight-import', () => ({ importHealthWeights: jest.fn() }));
jest.mock('./steps-import', () => ({ importHealthSteps: jest.fn() }));
jest.mock('./outside-workouts-import', () => ({ importOutsideWorkouts: jest.fn() }));

function AskCard({ kind = 'weight' }: { kind?: 'weight' | 'steps' | 'workouts' }) {
  return <ReadAskCard ask={useReadAsk(kind)} />;
}

const TITLE = 'Your weight from Apple Health';

beforeEach(() => {
  jest.clearAllMocks();
  setHealthConnected(true);
  setReadSync('weight', null);
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(true);
  jest.mocked(importHealthWeights).mockResolvedValue(true);
});

it('asks for weight, then reads it and hides', async () => {
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(readSync('weight')).toBe('on');
  expect(importHealthWeights).toHaveBeenCalled();
});

it('reads nothing when weight was not allowed', async () => {
  jest.mocked(requestHealthWeightAccess).mockResolvedValue(false);
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Bring in my weight' }));

  await waitFor(() => expect(readSync('weight')).toBe('off'));
  expect(importHealthWeights).not.toHaveBeenCalled();
});

it('hides for good on not now', async () => {
  await render(<AskCard />);

  fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

  await waitFor(() => expect(screen.queryByText(TITLE)).toBeNull());
  expect(readSync('weight')).toBe('off');
});

it('shows only to a user who connected the store and was not asked yet', async () => {
  setReadSync('weight', 'on');
  await render(<AskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();

  setReadSync('weight', null);
  setHealthConnected(false);
  await render(<AskCard />);
  expect(screen.queryByText(TITLE)).toBeNull();
});

it('asks for steps the same way, on their own', async () => {
  setReadSync('steps', null);
  jest.mocked(requestHealthStepsAccess).mockResolvedValue(true);
  await render(<AskCard kind="steps" />);
  expect(screen.getByText('Your steps from Apple Health')).toBeOnTheScreen();

  fireEvent.press(screen.getByRole('button', { name: 'Show my steps' }));

  await waitFor(() => expect(readSync('steps')).toBe('on'));
  expect(importHealthSteps).toHaveBeenCalled();
  expect(readSync('weight')).toBeNull();
});

it('asks to show the workouts other apps recorded, and brings them in once allowed', async () => {
  setReadSync('workouts', null);
  jest.mocked(requestHealthWorkoutsAccess).mockResolvedValue(true);
  jest.mocked(importOutsideWorkouts).mockResolvedValue(true);
  await render(<AskCard kind="workouts" />);
  expect(screen.getByText('Your other workouts from Apple Health')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Show my workouts' }));
  await waitFor(() => expect(readSync('workouts')).toBe('on'));
  expect(importOutsideWorkouts).toHaveBeenCalled();
});
