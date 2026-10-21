import * as Haptics from 'expo-haptics';
import { Text } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { RaisedPressable } from './raised-pressable';

jest.mock('expo-haptics', () => ({
  ...jest.requireActual<typeof import('expo-haptics')>('expo-haptics'),
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

describe('RaisedPressable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls onPress and gives haptic feedback', async () => {
    const onPress = jest.fn();
    await render(
      <RaisedPressable
        accessibilityRole="button"
        borderRadius={8}
        haptic="impact"
        onPress={onPress}
      >
        <Text>Press me</Text>
      </RaisedPressable>,
    );
    const button = screen.getByRole('button', { name: 'Press me' });
    await fireEvent(button, 'pressIn');
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('ignores presses while disabled', async () => {
    const onPress = jest.fn();
    await render(
      <RaisedPressable accessibilityRole="button" borderRadius={8} disabled onPress={onPress}>
        <Text>Press me</Text>
      </RaisedPressable>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Press me' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});
