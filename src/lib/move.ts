/**
 * A copy of `items` with the one at `from` moved to `to`; the same items when there is none at
 * `from`.
 */
export function move<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
}
