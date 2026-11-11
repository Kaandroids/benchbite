import { link } from './link';
import { openOnWatch, sentToWatch } from './open-on-watch';
import type { WatchState } from './protocol';

jest.mock('./link', () => ({ link: { startWatchApp: jest.fn() } }));

const sent = (id: string, follows: boolean) =>
  ({ workout: { id, follows } }) as unknown as WatchState;

describe('openOnWatch', () => {
  it('opens Benchbite on the watch once the watch is sent the workout it follows', () => {
    openOnWatch({ id: 'session-a', startedAt: 1 });
    sentToWatch(sent('session-b', true));
    sentToWatch(sent('session-a', false));
    expect(link.startWatchApp).not.toHaveBeenCalled();
    sentToWatch(sent('session-a', true));
    sentToWatch(sent('session-a', true));
    expect(link.startWatchApp).toHaveBeenCalledTimes(1);
  });
});
