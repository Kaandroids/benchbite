import { fireEvent, render, screen } from '@/test/render';
import { useStepDays } from '@/steps/steps';

import { StepsCard } from './steps-card';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/steps/steps', () => ({
  ...jest.requireActual('@/steps/steps'),
  useStepDays: jest.fn(),
}));

const TODAY = new Date(2026, 10, 8, 9, 0);

type Days = { day: string; steps: number }[];

/** This range's days, then the range before's. */
function mockDays(current: Days | undefined, before: Days = []) {
  jest.mocked(useStepDays).mockImplementation(
    (from) =>
      ({
        data: from.getTime() >= new Date(2026, 9, 8).getTime() ? current : before,
        isError: current === undefined,
        isPlaceholderData: false,
        refetch: jest.fn(),
      }) as never,
  );
}

beforeEach(() => jest.clearAllMocks());

it('shows the average a day against the range before', async () => {
  mockDays(
    [
      { day: '2026-11-01', steps: 8000 },
      { day: '2026-11-08', steps: 6000 },
    ],
    [{ day: '2026-10-01', steps: 5000 }],
  );
  await render(<StepsCard today={TODAY} />);

  expect(screen.getByText('7,000 a day on average')).toBeOnTheScreen();
  expect(screen.getByText('2,000 a day more than the range before')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Steps a day from October 8 to November 8, 7,000 on average'),
  ).toBeOnTheScreen();
});

it('says fewer steps without warning colour', async () => {
  mockDays([{ day: '2026-11-08', steps: 4000 }], [{ day: '2026-10-01', steps: 5000 }]);
  await render(<StepsCard today={TODAY} />);

  expect(screen.getByText('1,000 a day fewer than the range before')).toBeOnTheScreen();
});

it('says when the range has no steps', async () => {
  mockDays([]);
  await render(<StepsCard today={TODAY} />);

  expect(screen.getByText('No steps counted in this range.')).toBeOnTheScreen();
});

it('changes the range', async () => {
  mockDays([{ day: '2026-11-08', steps: 4000 }]);
  await render(<StepsCard today={TODAY} />);

  await fireEvent.press(screen.getByText('Year'));

  expect(useStepDays).toHaveBeenLastCalledWith(new Date(2024, 10, 7), new Date(2025, 10, 7));
});
