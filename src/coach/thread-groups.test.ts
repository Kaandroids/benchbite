import { dayKind, groupThreads, timeKind } from './thread-groups';
import type { ThreadSummary } from './threads';

const today = new Date(2026, 9, 30, 15);

const thread = (id: number, lastMessageAt: Date): ThreadSummary => ({
  id,
  title: `Chat ${id}`,
  lastMessageAt,
  lastMessage: null,
  lastPhotos: 0,
  firstPhotos: 0,
  expression: null,
});

describe('groupThreads', () => {
  it('groups by today, yesterday, the last week and the month, leaving out empty ones', () => {
    const groups = groupThreads(
      [
        thread(1, new Date(2026, 9, 30, 9)),
        thread(2, new Date(2026, 9, 29, 18)),
        thread(3, new Date(2026, 9, 25)),
        thread(4, new Date(2026, 9, 14)),
        thread(5, new Date(2026, 9, 2)),
        thread(6, new Date(2026, 8, 20)),
      ],
      today,
    );
    expect(groups.map((group) => [group.kind, group.threads.map((t) => t.id)])).toEqual([
      ['today', [1]],
      ['yesterday', [2]],
      ['week', [3]],
      ['month', [4, 5]],
      ['month', [6]],
    ]);
  });

  it('gives no section without a thread', () => {
    expect(groupThreads([], today)).toEqual([]);
  });
});

describe('timeKind', () => {
  it('shows the clock today and yesterday, the weekday this week, else the date', () => {
    expect(timeKind(thread(1, new Date(2026, 9, 30, 9)), today)).toBe('clock');
    expect(timeKind(thread(1, new Date(2026, 9, 29, 9)), today)).toBe('clock');
    expect(timeKind(thread(1, new Date(2026, 9, 26)), today)).toBe('weekday');
    expect(timeKind(thread(1, new Date(2026, 9, 2)), today)).toBe('date');
  });
});

describe('dayKind', () => {
  it('tells today, yesterday, the last week and before apart, by the calendar', () => {
    expect(dayKind(new Date(2026, 9, 30, 0, 5), today)).toBe('today');
    expect(dayKind(new Date(2026, 9, 29, 23, 55), today)).toBe('yesterday');
    expect(dayKind(new Date(2026, 9, 24), today)).toBe('week');
    expect(dayKind(new Date(2026, 9, 23), today)).toBe('older');
  });
});
