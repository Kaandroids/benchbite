import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { postFunction } from '@/lib/supabase';

import { exportFileName, shareExport, TooManyExports, writeExport } from './export';

jest.mock('@/lib/supabase', () => ({ postFunction: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-file-system', () => {
  class MockFile {
    /** Every file made, and whether writing fails, for the tests to set. */
    static made: MockFile[] = [];
    static failWrite = false;
    static downloadFileAsync = jest.fn((_url: string, file: MockFile) =>
      MockFile.failWrite ? Promise.reject(new Error('full')) : Promise.resolve(file),
    );
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
const Files = File as unknown as {
  made: MockFile[];
  failWrite: boolean;
  downloadFileAsync: jest.Mock;
};

/** The link to the stored ZIP the server answers with. */
const URL = 'https://storage.test/data-exports/a/1.zip?token=t';

beforeEach(() => {
  jest.clearAllMocks();
  Files.made = [];
  Files.failWrite = false;
  jest.mocked(Paths.cache.list).mockReturnValue([]);
  jest.mocked(postFunction).mockResolvedValue(Response.json({ url: URL }));
});

it('names the file after the device’s day it was made', () => {
  expect(exportFileName(new Date(2026, 10, 19, 0, 30))).toBe('benchbite-data-2026-11-19.zip');
});

it('writes what the server gathers to a file in the cache', async () => {
  const file = (await writeExport(new Date(2026, 10, 18, 10))) as MockFile;
  expect(postFunction).toHaveBeenCalledWith('export-my-data', {});
  expect(file.uri).toBe('file:///cache/benchbite-data-2026-11-18.zip');
  expect(Files.downloadFileAsync).toHaveBeenCalledWith(URL, file, { idempotent: true });
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
  jest.mocked(postFunction).mockResolvedValue(new Response('down', { status: 503 }));
  await expect(writeExport()).rejects.toThrow('503');
  expect(Paths.cache.list).not.toHaveBeenCalled();
  expect(Files.made).toHaveLength(0);
});

it('deletes a file it could not finish writing', async () => {
  Files.failWrite = true;
  await expect(writeExport()).rejects.toThrow('full');
  expect(Files.made[0]!.delete).toHaveBeenCalled();
});

it('shares the file as a ZIP, and leaves it for the next export to delete', async () => {
  const file = (await writeExport(new Date(2026, 10, 18, 10))) as MockFile;
  await shareExport(file, 'Export your data');
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/benchbite-data-2026-11-18.zip', {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: 'Export your data',
  });
  expect(file.delete).not.toHaveBeenCalled();
});

it('says apart a third export in the hour, and downloads nothing', async () => {
  jest
    .mocked(postFunction)
    .mockResolvedValue(Response.json({ error: 'too_many_exports' }, { status: 429 }));
  await expect(writeExport()).rejects.toBeInstanceOf(TooManyExports);
  expect(Files.downloadFileAsync).not.toHaveBeenCalled();
});
