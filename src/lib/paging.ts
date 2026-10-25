/** The most rows the API returns for one request (max_rows in supabase/config.toml). */
export const PAGE_SIZE = 1000;

/**
 * Every row of a query that can return more than one request's worth, read a page at a time until
 * a page comes back short. The query must have a stable order, so that pages neither repeat nor
 * skip rows.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) {
      throw error;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
}
