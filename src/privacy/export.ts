// Exporting all of the user's data as one file (#553, ADR 0147): the server gathers it, the phone
// writes it to its cache and shares it, and deletes it once it is shared.
import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { toIsoDate } from '@/i18n/dates';
import { supabase } from '@/lib/supabase';

const PREFIX = 'benchbite-data-';

/** The export's name, with the device's day it was made: benchbite-data-2026-11-18.json. */
export const exportFileName = (now: Date) => `${PREFIX}${toIsoDate(now)}.json`;

/**
 * Deletes the exports an earlier run left in the cache: one never shared, as when the app was
 * closed in between, or one whose share could not be awaited.
 */
function removeLeftExports() {
  for (const entry of Paths.cache.list()) {
    if (entry instanceof File && entry.name.startsWith(PREFIX)) entry.delete();
  }
}

/** Writes the user's data to a file in the cache, as the server gives it, and returns it. */
export async function writeExport(now = new Date()): Promise<File> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  removeLeftExports();
  const file = new File(Paths.cache, exportFileName(now));
  try {
    file.create({ overwrite: true });
    await file.write(JSON.stringify(data, null, 2));
  } catch (cause) {
    // Half a file of health data is of no use, and should not stay.
    if (file.exists) file.delete();
    throw cause;
  }
  return file;
}

/**
 * Shares the file through the phone's share sheet, then deletes it: it holds health data, which
 * should stay only where the user put it.
 */
export async function shareExport(file: File, dialogTitle: string): Promise<void> {
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle,
    });
  } finally {
    if (file.exists) file.delete();
  }
}

/** Makes the file; sharing it is the caller's, once its sheet has closed. */
export function useWriteExport() {
  return useMutation({ mutationFn: () => writeExport() });
}
