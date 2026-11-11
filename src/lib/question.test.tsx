import { Text } from 'react-native';

import { Sheet } from '@/components/ui/sheet';
import { act, render, screen } from '@/test/render';

import { createQuestion } from './question';

const question = createQuestion<string, string | null>(null);

function Asked() {
  const current = question.useQuestion();
  return current ? <Text>{current.question}</Text> : null;
}

describe('createQuestion', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    question.cancel();
    jest.useRealTimers();
  });

  it('shows a question once a sheet that just closed has closed, as iOS would not show it', async () => {
    await render(<Sheet onClose={() => {}}>{null}</Sheet>);
    await screen.unmount();
    await render(<Asked />);
    let answer: Promise<string | null> = Promise.resolve(null);
    await act(() => {
      answer = question.ask('Which day?');
    });
    expect(screen.queryByText('Which day?')).toBeNull();
    await act(() => jest.advanceTimersByTimeAsync(400));
    expect(screen.getByText('Which day?')).toBeTruthy();
    await act(() => question.cancel());
    await expect(answer).resolves.toBeNull();
  });

  it('cancels a question asked while it waits to show', async () => {
    await render(<Sheet onClose={() => {}}>{null}</Sheet>);
    await screen.unmount();
    const first = question.ask('First?');
    const second = question.ask('Second?');
    await expect(first).resolves.toBeNull();
    await render(<Asked />);
    await act(() => jest.advanceTimersByTimeAsync(400));
    expect(screen.queryByText('First?')).toBeNull();
    expect(screen.getByText('Second?')).toBeTruthy();
    await act(() => question.cancel());
    await expect(second).resolves.toBeNull();
  });
});
