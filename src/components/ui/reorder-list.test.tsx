import { AccessibilityInfo, Text } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { ReorderList } from './reorder-list';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

const ITEMS = ['Squat', 'Bench press', 'Row'];

const renderList = async (onMove = jest.fn()) => {
  await render(
    <ReorderList
      items={ITEMS}
      keyOf={(item) => item}
      rowHeight={60}
      onMove={onMove}
      labelOf={(item) => item}
      renderItem={(item) => <Text>{item}</Text>}
    />,
  );
  return onMove;
};

describe('ReorderList', () => {
  it('tells screen readers each row and its place', async () => {
    await renderList();
    const handle = screen.getByLabelText('Bench press');
    expect(handle.props.accessibilityValue).toEqual({ text: '2 of 3' });
    expect(
      handle.props.accessibilityActions.map((action: { name: string }) => action.name),
    ).toEqual(['moveUp', 'moveDown']);
    // The first row cannot move up, the last one not down.
    expect(screen.getByLabelText('Squat').props.accessibilityActions).toEqual([
      { name: 'moveDown', label: 'Move down' },
    ]);
    expect(screen.getByLabelText('Row').props.accessibilityActions).toEqual([
      { name: 'moveUp', label: 'Move up' },
    ]);
  });

  it('moves a row a place up or down with the actions, and says where it went', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const onMove = await renderList();
    await fireEvent(screen.getByLabelText('Bench press'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
    expect(announce).toHaveBeenLastCalledWith('Bench press moved to 1 of 3');
    await fireEvent(screen.getByLabelText('Bench press'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveDown' },
    });
    expect(onMove).toHaveBeenLastCalledWith(1, 2);
  });
});
