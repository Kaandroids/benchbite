import { fetchAllPages, PAGE_SIZE } from './paging';

describe('fetchAllPages', () => {
  it('reads pages until one comes back short', async () => {
    const all = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, index) => index);
    const page = jest.fn((from: number, to: number) =>
      Promise.resolve({ data: all.slice(from, to + 1), error: null }),
    );
    await expect(fetchAllPages(page)).resolves.toEqual(all);
    expect(page.mock.calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1],
    ]);
  });

  it('reads one more page when the last one is exactly full', async () => {
    const page = jest.fn((from: number) =>
      Promise.resolve({ data: from === 0 ? Array<number>(PAGE_SIZE).fill(1) : [], error: null }),
    );
    await expect(fetchAllPages(page)).resolves.toHaveLength(PAGE_SIZE);
    expect(page).toHaveBeenCalledTimes(2);
  });

  it('fails when a page fails', async () => {
    const error = new Error('offline');
    await expect(fetchAllPages(() => Promise.resolve({ data: null, error }))).rejects.toBe(error);
  });
});
