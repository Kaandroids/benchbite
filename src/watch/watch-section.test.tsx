import { fireEvent, render, screen } from '@/test/render';

import { loadStartOnWatch } from './start-on-watch';
import { WatchSection } from './watch-section';

jest.mock('expo-sqlite/kv-store', () => {
  const items = new Map<string, string>();
  return {
    Storage: {
      getItemSync: (key: string) => items.get(key) ?? null,
      setItemSync: (key: string, value: string) => void items.set(key, value),
      removeItemSync: (key: string) => void items.delete(key),
    },
  };
});

describe('WatchSection', () => {
  it('asks by default, and keeps a new choice with its note', async () => {
    await render(<WatchSection />);
    expect(screen.getByText('Benchbite is on your watch')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Ask' })).toBeChecked();
    await fireEvent.press(screen.getByRole('radio', { name: 'Never' }));
    expect(screen.getByRole('radio', { name: 'Never' })).toBeChecked();
    expect(loadStartOnWatch()).toBe('never');
    expect(
      screen.getByText(
        'Workouts stay on this phone, which tells you when a rest is over. You can still open Benchbite on the watch and join one.',
      ),
    ).toBeTruthy();
  });
});
