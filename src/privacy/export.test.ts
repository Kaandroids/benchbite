import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { postFunction } from '@/lib/supabase';

import { exportFileName, shareExport, writeExport } from './export';

jest.mock('@/lib/supabase', () => ({ postFunction: jest.fn() }));
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

/** The ZIP the server answers with, as bytes. */
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

beforeEach(() => {
  jest.clearAllMocks();
  Files.made = [];
  Files.failWrite = false;
  jest.mocked(Paths.cache.list).mockReturnValue([]);
  jest.mocked(postFunction).mockResolvedValue(new Response(ZIP, { status: 200 }));
});

it('names the file after the device’s day it was made', () => {
  expect(exportFileName(new Date(2026, 10, 19, 0, 30))).toBe('benchbite-data-2026-11-19.zip');
});

it('writes what the server gathers to a file in the cache', async () => {
  const file = (await writeExport(new Date(2026, 10, 18, 10))) as MockFile;
  expect(postFunction).toHaveBeenCalledWith('export-my-data', {});
  expect(file.uri).toBe('file:///cache/benchbite-data-2026-11-18.zip');
  expect(file.create).toHaveBeenCalledWith({ overwrite: true });
  expect(file.write.mock.calls[0][0]).toEqual(ZIP);
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
