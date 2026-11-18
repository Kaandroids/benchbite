import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { supabase } from '@/lib/supabase';

import { exportFileName, shareExport, writeExport } from './export';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  class MockFile {
    /** Every file made, and whether writing fails, for the tests to set. */
    static made: MockFile[] = [];
    static failWrite = false;
    uri: string;
    name: string;
    exists = true;
    create = jest.fn();
    write = jest.fn(() =>
      MockFile.failWrite ? Promise.reject(new Error('full')) : Promise.resolve(),
    );
    delete = jest.fn();
    constructor(_dir: unknown, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
      MockFile.made.push(this);
    }
  }
  return { File: MockFile, Paths: { cache: { list: jest.fn(() => []) } } };
});

type MockFile = File & { create: jest.Mock; write: jest.Mock; delete: jest.Mock };
const Files = File as unknown as { made: MockFile[]; failWrite: boolean };

beforeEach(() => {
  jest.clearAllMocks();
  Files.made = [];
  Files.failWrite = false;
  jest.mocked(Paths.cache.list).mockReturnValue([]);
  jest
    .mocked(supabase.rpc)
    .mockResolvedValue({ data: { format: 'benchbite-export' }, error: null } as never);
});

it('names the file after the device’s day it was made', () => {
  expect(exportFileName(new Date(2026, 10, 19, 0, 30))).toBe('benchbite-data-2026-11-19.json');
});

it('writes what the server gathers to a file in the cache', async () => {
  const file = (await writeExport(new Date(2026, 10, 18, 10))) as MockFile;
  expect(supabase.rpc).toHaveBeenCalledWith('export_my_data');
  expect(file.uri).toBe('file:///cache/benchbite-data-2026-11-18.json');
  expect(file.create).toHaveBeenCalledWith({ overwrite: true });
  expect(JSON.parse(file.write.mock.calls[0][0] as string)).toEqual({ format: 'benchbite-export' });
});

it('first deletes the exports an earlier run left, and nothing else', async () => {
  const left = new File(Paths.cache, 'benchbite-data-2026-11-01.json') as MockFile;
  const other = new File(Paths.cache, 'photo.jpg') as MockFile;
  jest.mocked(Paths.cache.list).mockReturnValue([left, other]);
  await writeExport();
  expect(left.delete).toHaveBeenCalled();
  expect(other.delete).not.toHaveBeenCalled();
});

it('writes nothing when the server fails', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('down') } as never);
  await expect(writeExport()).rejects.toThrow('down');
  expect(Paths.cache.list).not.toHaveBeenCalled();
  expect(Files.made).toHaveLength(0);
});

it('deletes a file it could not finish writing', async () => {
  Files.failWrite = true;
  await expect(writeExport()).rejects.toThrow('full');
  expect(Files.made[0]!.delete).toHaveBeenCalled();
});

it('shares the file as JSON, then deletes it, also when sharing fails', async () => {
  const file = (await writeExport(new Date(2026, 10, 18, 10))) as MockFile;

  await shareExport(file, 'Export your data');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/benchbite-data-2026-11-18.json', {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export your data',
  });
  expect(file.delete).toHaveBeenCalledTimes(1);

  jest.mocked(Sharing.shareAsync).mockRejectedValueOnce(new Error('no'));
  await expect(shareExport(file, 'Export your data')).rejects.toThrow('no');
  expect(file.delete).toHaveBeenCalledTimes(2);
});
