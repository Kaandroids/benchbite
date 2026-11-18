import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from '@/lib/supabase';

import { exportFileName, shareExport, writeExport } from './export';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: jest.fn((_dir: unknown, name: string) => ({
    uri: `file:///cache/${name}`,
    exists: true,
    create: jest.fn(),
    write: jest.fn(() => Promise.resolve()),
    delete: jest.fn(),
  })),
}));

/** The file writeExport() made, as the mock above makes it. */
const madeFile = () =>
  jest.mocked(File).mock.results[0]!.value as {
    create: jest.Mock;
    write: jest.Mock;
    delete: jest.Mock;
    uri: string;
  };

beforeEach(() => {
  jest.clearAllMocks();
});

it('names the file after the day it was made', () => {
  expect(exportFileName(new Date('2026-11-18T22:00:00Z'))).toBe('benchbite-data-2026-11-18.json');
});

it('writes what the server gathers to a file in the cache', async () => {
  jest
    .mocked(supabase.rpc)
    .mockResolvedValue({ data: { format: 'benchbite-export' }, error: null } as never);
  const file = await writeExport(new Date('2026-11-18T10:00:00Z'));
  expect(supabase.rpc).toHaveBeenCalledWith('export_my_data');
  expect(file.uri).toBe('file:///cache/benchbite-data-2026-11-18.json');
  expect(madeFile().create).toHaveBeenCalledWith({ overwrite: true });
  expect(JSON.parse(madeFile().write.mock.calls[0][0] as string)).toEqual({
    format: 'benchbite-export',
  });
});

it('writes nothing when the server fails', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('down') } as never);
  await expect(writeExport()).rejects.toThrow('down');
  expect(File).not.toHaveBeenCalled();
});

it('shares the file as JSON, then deletes it, also when sharing fails', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: {}, error: null } as never);
  const file = await writeExport(new Date('2026-11-18T10:00:00Z'));

  await shareExport(file, 'Export your data');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/benchbite-data-2026-11-18.json', {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export your data',
  });
  expect(madeFile().delete).toHaveBeenCalledTimes(1);

  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('no'));
  await expect(shareExport(file, 'Export your data')).rejects.toThrow('no');
  expect(madeFile().delete).toHaveBeenCalledTimes(2);
});
