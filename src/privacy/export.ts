// Exporting all of the user's data as one file (#553, ADR 0147): the server gathers it as a ZIP with
// the user's photos and voice messages (ADR 0168), the phone writes it to its cache and shares it,
// and the next export deletes it.
import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { toIsoDate } from '@/i18n/dates';
import { postFunction } from '@/lib/supabase';

const PREFIX = 'benchbite-data-';

/** The export's name, with the device's day it was made: benchbite-data-2026-11-18.zip. */
export const exportFileName = (now: Date) => `${PREFIX}${toIsoDate(now)}.zip`;

/**
 * Deletes the exports an earlier run left in the cache: the one shared last, and one never shared,
 * as when the app was closed in between.
 */
function removeLeftExports() {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) entry.delete();
  }
}

/** Writes the user's data to a file in the cache, as the server gives it, and returns it. */
export async function writeExport(now = new Date()): Promise<File> {
  const response = await postFunction('export-my-data', {});
  if (!response.ok) throw new Error(`The export failed with ${response.status}`);
  const zip = new Uint8Array(await response.arrayBuffer());
  removeLeftExports();
  const file = new File(Paths.cache, exportFileName(now));
  try {
    file.create({ overwrite: true });
    await file.write(zip);
  } catch (cause) {
    // Half a file of health data is of no use, and should not stay.
    if (file.exists) file.delete();
    throw cause;
  }
  return file;
}

/**
 * Shares the file through the phone's share sheet. It stays in the cache until the next export:
 * on Android the sheet returns before an app that reads in the background, as Drive does, is done.
 */
export function shareExport(file: File, dialogTitle: string): Promise<void> {
  return Sharing.shareAsync(file.uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle,
  });
}

/** Makes the file; sharing it is the caller's, once its sheet has closed. */
export function useWriteExport() {
  return useMutation({
    meta: { where: 'Could not export the data' },
    mutationFn: () => writeExport(),
  });
}
