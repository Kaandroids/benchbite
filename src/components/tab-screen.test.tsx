import { Text } from 'react-native';

import { act, render, screen } from '@/test/render';

import { TabScreen } from './tab-screen';

describe('TabScreen', () => {
  it('shows its content and the overlay, and loads the queries again when pulled down', async () => {
    const queries = [{ refetch: jest.fn(async () => 1) }, { refetch: jest.fn(async () => 2) }];
    await render(
      <TabScreen queries={queries} overlay={<Text>Sheet</Text>}>
        <Text>Content</Text>
      </TabScreen>,
    );
    expect(screen.getByText('Content')).toBeTruthy();
    expect(screen.getByText('Sheet')).toBeTruthy();

    // The mock of RefreshControl drops its props, so the handler is taken from the scroll view.
    const [scrollView] = screen.container.queryAll((node) => node.type === 'RCTScrollView');
    await act(() => scrollView!.props.refreshControl.props.onRefresh());
    for (const query of queries) {
      expect(query.refetch).toHaveBeenCalled();
    }
  });
});
