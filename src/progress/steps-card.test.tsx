import { fireEvent, render, screen } from '@/test/render';
import { useStepDays } from '@/steps/steps';

import { StepsCard, stepBars } from './steps-card';

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

  // Today is still being counted, so it is left out of the average.
  expect(screen.getByText('8,000 a day on average')).toBeOnTheScreen();
  expect(screen.getByText('3,000 a day more than the range before')).toBeOnTheScreen();
  expect(
    screen.getByLabelText('Steps a day from October 8 to November 8, 8,000 on average'),
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

describe('stepBars', () => {
  it('makes a bar a month over a year, each the average of its days counted', () => {
    const bars = stepBars('month', new Date(2025, 10, 8), TODAY, [
      { day: '2025-11-10', steps: 4000 },
      { day: '2025-11-20', steps: 6000 },
    ]);

    expect(bars).toHaveLength(13);
    expect(bars[0]).toEqual({ start: '2025-11-01', steps: 5000 });
    expect(bars[1]).toEqual({ start: '2025-12-01', steps: 0 });
  });

  it('leaves today out of its week while another day of the week counts', () => {
    const bars = stepBars('week', new Date(2026, 10, 2), TODAY, [
      { day: '2026-11-03', steps: 9000 },
      { day: '2026-11-08', steps: 800 },
    ]);

    expect(bars).toEqual([{ start: '2026-11-02', steps: 9000 }]);
  });

  it("shows today's count for a span of today alone", () => {
    expect(stepBars('day', TODAY, TODAY, [{ day: '2026-11-08', steps: 800 }])).toEqual([
      { start: '2026-11-08', steps: 800 },
    ]);
  });
});
