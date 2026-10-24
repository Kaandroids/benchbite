import { render, screen } from '@/test/render';

import { allLoaded, LoadState } from './load-state';

const query = (state: { data?: unknown; isPending?: boolean; isError?: boolean }) => ({
  data: state.data,
  isPending: state.isPending ?? false,
  isError: state.isError ?? false,
  isFetching: false,
  refetch: jest.fn(),
});

describe('allLoaded', () => {
  it('waits for every query to have data', () => {
    expect(allLoaded([query({ data: [] }), query({ isPending: true })])).toBe(false);
    expect(allLoaded([query({ data: [] }), query({ isError: true })])).toBe(false);
    expect(allLoaded([query({ data: [] }), query({ data: null })])).toBe(true);
  });

  it('keeps what loaded when a query fails to refresh', () => {
    expect(allLoaded([query({ data: [], isError: true })])).toBe(true);
  });
});

describe('LoadState', () => {
  it('offers to try again for a query that failed to load', async () => {
    const failed = query({ isError: true });
    await render(<LoadState queries={[query({ data: [] }), failed]} />);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows a spinner while a query loads', async () => {
    await render(<LoadState queries={[query({ isPending: true })]} />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
