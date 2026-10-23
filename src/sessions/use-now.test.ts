import { act, renderHook } from '@/test/render';

import { useNow } from './use-now';

const NOW = new Date(2026, 9, 23, 18, 0).getTime();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
});

it('updates just after each whole second from the start of a clock', async () => {
  const since = NOW - 300;
  const { result } = await renderHook(() => useNow(true, since));
  await act(async () => {
    jest.advanceTimersByTime(700);
  });
  expect(result.current).toBe(NOW);
  await act(async () => {
    jest.advanceTimersByTime(5);
  });
  expect(Math.floor((result.current - since) / 1000)).toBe(1);
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(Math.floor((result.current - since) / 1000)).toBe(2);
});

it('does not update while not running', async () => {
  const { result } = await renderHook(() => useNow(false));
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(result.current).toBe(NOW);
});
