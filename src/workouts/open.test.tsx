import { router, Stack, Tabs } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { unstable_settings } from '@/app/(app)/workout/_layout';

import { openLog, openWorkout } from './open';

/** Today and the Workout tab, with the tab's own anchor and stand-ins for its screens. */
function renderTabs() {
  return renderRouter(
    {
      _layout: () => (
        <Tabs>
          <Tabs.Screen name="index" />
          <Tabs.Screen name="workout" />
        </Tabs>
      ),
      index: () => <Text>Today</Text>,
      'workout/_layout': { default: () => <Stack />, unstable_settings },
      'workout/index': () => <Text>Workouts</Text>,
      'workout/[id]': () => <Text>Workout</Text>,
      'workout/log/[id]': () => <Text>Log</Text>,
    },
    { initialUrl: '/' },
  );
}

it('opens a log from Today with the Workout list beneath it, which back returns to', async () => {
  await renderTabs();
  await act(() => openLog(7));
  expect(screen).toHavePathname('/workout/log/7');
  await act(() => router.back());
  expect(screen).toHavePathname('/workout');
});

it('opens a workout from Today with the list beneath it too', async () => {
  await renderTabs();
  await act(() => openWorkout(3));
  expect(screen).toHavePathname('/workout/3');
  await act(() => router.back());
  expect(screen).toHavePathname('/workout');
});
