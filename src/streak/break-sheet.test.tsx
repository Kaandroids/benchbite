import { fireEvent, render, screen } from '@/test/render';

import { BreakSheet } from './break-sheet';
import { useAnswerBreak } from './use-streak';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./use-streak', () => ({ useAnswerBreak: jest.fn() }));

// A Thursday.
const TODAY = new Date(2026, 9, 29, 9, 0);
const answer = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(useAnswerBreak)
    .mockReturnValue({ mutate: answer, isPending: false, isError: false } as never);
});

describe('BreakSheet', () => {
  it('freezes the missed days when the freezes cover them', async () => {
    const onAnswered = jest.fn();
    await render(
      <BreakSheet
        streakBreak={{ missed: ['2026-10-26', '2026-10-27'], freezes: 3, savedCount: 9 }}
        today={TODAY}
        onLog={jest.fn()}
        onAnswered={onAnswered}
      />,
    );
    expect(screen.getByText("2 days didn't count.")).toBeTruthy();
    expect(screen.getByText('You have 3 freezes')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Use 2 freezes, keep 9 days' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: true }, expect.anything());
    answer.mock.calls[0][1].onSuccess();
    expect(onAnswered).toHaveBeenCalledWith('Streak kept: 2 days frozen. 1 freeze left.');
  });

  it('starts again when asked', async () => {
    const onAnswered = jest.fn();
    await render(
      <BreakSheet
        streakBreak={{ missed: ['2026-10-28'], freezes: 1, savedCount: 4 }}
        today={TODAY}
        onLog={jest.fn()}
        onAnswered={onAnswered}
      />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Start again' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: false }, expect.anything());
    answer.mock.calls[0][1].onSuccess();
    expect(onAnswered).toHaveBeenCalledWith(null);
  });

  it('offers only a new streak without enough freezes, and logs the days still open', async () => {
    const onLog = jest.fn();
    await render(
      <BreakSheet
        streakBreak={{
          missed: ['2026-10-19', '2026-10-20', '2026-10-26', '2026-10-27'],
          freezes: 3,
          savedCount: 14,
        }}
        today={TODAY}
        onLog={onLog}
        onAnswered={jest.fn()}
      />,
    );
    expect(
      screen.getByText("4 days didn't count. You have 3 freezes: not enough to cover them all."),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /freeze/ })).toBeNull();
    expect(screen.getAllByText('Can no longer be logged')).toHaveLength(2);
    await fireEvent.press(screen.getByRole('link', { name: 'Log Mon, Oct 26' }));
    expect(onLog).toHaveBeenCalledWith('2026-10-26');
    await fireEvent.press(screen.getByRole('button', { name: 'Start a new streak' }));
    expect(answer).toHaveBeenCalledWith({ today: TODAY, useFreezes: false }, expect.anything());
  });

  it('says when there are no freezes left, and keeps one day in the singular', async () => {
    await render(
      <BreakSheet
        streakBreak={{ missed: ['2026-10-28'], freezes: 0, savedCount: 1 }}
        today={TODAY}
        onLog={jest.fn()}
        onAnswered={jest.fn()}
      />,
    );
    expect(
      screen.getByText("Wednesday, October 28 didn't count. You have no freezes left."),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start a new streak' })).toBeTruthy();
  });

  it('keeps a single day in the singular', async () => {
    await render(
      <BreakSheet
        streakBreak={{ missed: ['2026-10-28'], freezes: 1, savedCount: 1 }}
        today={TODAY}
        onLog={jest.fn()}
        onAnswered={jest.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Use 1 freeze, keep 1 day' })).toBeTruthy();
  });
});
