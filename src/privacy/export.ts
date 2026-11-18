// Exporting all of the user's data as one file (#553, ADR 0147): the server gathers it, the phone
// writes it to its cache and shares it, and deletes it once it is shared.
import { useMutation } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from '@/lib/supabase';

/** The export's name, with the day it was made: benchbite-data-2026-11-18.json. */
export const exportFileName = (now: Date) =>
  `benchbite-data-${now.toISOString().slice(0, 10)}.json`;

/** Writes the user's data to a file in the cache, as the server gives it, and returns it. */
export async function writeExport(now = new Date()): Promise<File> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  const file = new File(Paths.cache, exportFileName(now));
  file.create({ overwrite: true });
  await file.write(JSON.stringify(data, null, 2));
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
