import { hasWatch, NO_WATCH } from './types';

describe('hasWatch', () => {
  it('needs a paired watch with Benchbite on it', () => {
    const watch = { ...NO_WATCH, paired: true, installed: true };
    expect(hasWatch(watch)).toBe(true);
    expect(hasWatch({ ...watch, installed: false })).toBe(false);
    expect(hasWatch(NO_WATCH)).toBe(false);
  });
});
