/** How many calls to the store a read makes at once: together, without flooding it. */
const BATCH = 8;

/** Maps items a few at a time, in their order, for calls to the store that each take a moment. */
export async function inBatches<T, R>(items: T[], map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let first = 0; first < items.length; first += BATCH) {
    results.push(...(await Promise.all(items.slice(first, first + BATCH).map(map))));
  }
  return results;
}
