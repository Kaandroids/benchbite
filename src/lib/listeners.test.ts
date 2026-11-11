import { createListeners } from './listeners';

describe('createListeners', () => {
  it('tells each listener of a change until it unsubscribes', () => {
    const listeners = createListeners();
    const first = jest.fn();
    const second = jest.fn();
    const stop = listeners.subscribe(first);
    listeners.subscribe(second);
    listeners.notify();
    stop();
    listeners.notify();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });
});
