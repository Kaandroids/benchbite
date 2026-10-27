import type { LoggedEntry } from './meals';
import { handOverRemovedEntry, takeRemovedEntry } from './removed-entry';

const MILK = { id: 7, day: '2026-10-27', meal: 'breakfast', name: 'Whole milk' } as LoggedEntry;

describe('takeRemovedEntry', () => {
  it('hands the removed entry over once, to the screen of its meal and day', () => {
    handOverRemovedEntry(MILK);
    expect(takeRemovedEntry('lunch', '2026-10-27')).toBeNull();
    expect(takeRemovedEntry('breakfast', '2026-10-26')).toBeNull();
    expect(takeRemovedEntry('breakfast', '2026-10-27')).toBe(MILK);
    expect(takeRemovedEntry('breakfast', '2026-10-27')).toBeNull();
  });
});
