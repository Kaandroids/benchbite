// Removing files through the Storage API, shared by the functions that clean up after a user.
import type { Client } from './supabase.ts';

/** Files listed and removed per request. */
export const PAGE_SIZE = 100;

/**
 * Removes every file in a folder that holds no folders, a page at a time, until listing it finds
 * none. Throws when storage fails or removes nothing of a page, so that the caller can try again.
 */
export async function emptyFolder(
  admin: Client,
  bucketName: string,
  folder: string,
): Promise<void> {
  const bucket = admin.storage.from(bucketName);
  for (;;) {
    const { data: listed, error } = await bucket.list(folder, { limit: PAGE_SIZE });
    if (error) throw error;
    // A folder entry has no id.
    const paths = listed
      .filter((entry) => entry.id !== null)
      .map((entry) => `${folder}/${entry.name}`);
    if (paths.length === 0) return;

    const { data: removed, error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
    if (removed.length === 0) throw new Error('Storage removed none of the listed files');
  }
}
