import { Text } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { TabBar } from './tab-bar';

const ROUTES = ['index', 'workout', 'nutrition', 'progress'].map((name) => ({
  key: `${name}-key`,
  name,
}));

function renderBar(index: number, defaultPrevented = false) {
  const emit = jest.fn(() => ({ defaultPrevented }));
  const navigateToTab = jest.fn();
  return render(
    <TabBar
      state={{ index, routes: ROUTES } as never}
      descriptors={{} as never}
      emitter={{ emit } as never}
      navigateToTab={navigateToTab}
      insets={{ top: 0, right: 0, bottom: 34, left: 0 }}
      middle={<Text>Middle</Text>}
      hidden={false}
    />,
  ).then(() => ({ emit, navigateToTab }));
}

beforeEach(() => jest.clearAllMocks());

it('shows the four tabs around Bite, the open one selected', async () => {
  await renderBar(2);
  expect(
    screen
      .getAllByRole('tab')
      .map((tab) => [tab.props.accessibilityLabel, tab.props.accessibilityState.selected]),
  ).toEqual([
    ['Today', false],
    ['Workout', false],
    ['Nutrition', true],
    ['Progress', false],
  ]);
  expect(screen.getByText('Middle')).toBeTruthy();
});

it('opens another tab, telling the tab it was pressed', async () => {
  const { emit, navigateToTab } = await renderBar(0);
  await fireEvent.press(screen.getByRole('tab', { name: 'Progress' }));
  expect(emit).toHaveBeenCalledWith({
    type: 'tabPress',
    target: 'progress-key',
    canPreventDefault: true,
  });
  expect(navigateToTab).toHaveBeenCalledWith('progress-key');
});

it('only tells the open tab it was pressed again, which scrolls it to the top', async () => {
  const { emit, navigateToTab } = await renderBar(0);
  await fireEvent.press(screen.getByRole('tab', { name: 'Today' }));
  expect(emit).toHaveBeenCalled();
  expect(navigateToTab).not.toHaveBeenCalled();
});
