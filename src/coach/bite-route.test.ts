import { chatOf } from './bite-route';

jest.mock('expo-router', () => ({ router: {} }));

describe('chatOf', () => {
  it('opens a saved thread by its id', () => {
    expect(chatOf({ thread: '7', fresh: '' })).toEqual({ threadId: 7, key: 'thread-7' });
  });

  it('opens a new chat with a key of its own, for anything but an id', () => {
    expect(chatOf({ thread: '', fresh: '123' })).toEqual({ key: 'new-123' });
    expect(chatOf({ thread: '7abc' })).toEqual({ key: 'new-' });
    expect(chatOf({})).toEqual({ key: 'new-' });
  });
});
