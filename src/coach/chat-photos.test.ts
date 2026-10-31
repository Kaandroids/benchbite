import { fromBase64, toBase64 } from '@shared/base64_bytes';
import { MAX_PHOTO_BYTES } from '@shared/photos';

import { supabase } from '@/lib/supabase';
import { discardPhotos, preparePhoto } from '@/nutrition/meal-estimate';

import {
  forgetPhotoUrls,
  localTime,
  messagePhotos,
  photosToSend,
  photoUrls,
  prepareChatPhoto,
} from './chat-photos';

jest.mock('@/lib/supabase', () => ({ supabase: { storage: { from: jest.fn() } } }));
jest.mock('@/nutrition/meal-estimate', () => ({
  preparePhoto: jest.fn(),
  discardPhotos: jest.fn(),
}));

/** A segment: its marker, then its length, which counts itself, and its data. */
function segment(marker: number, data: number[] = []): number[] {
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...data];
}
const text = (value: string) => [...new TextEncoder().encode(value)];

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];
const JFIF = segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const ICC = segment(0xe2, [...text('ICC_PROFILE\0'), 1, 1]);
const ADOBE = segment(0xee, [...text('Adobe'), 0, 100, 0, 0, 0, 0, 1]);
const FRAME = segment(0xc0, [8, 0x01, 0xe0, 0x02, 0x80, 1, 1, 0x11, 0]);
const TABLES = segment(0xc4, [0, ...new Array(16).fill(0)]);
const SCAN = [...segment(0xda, [1, 1, 0, 0, 0x3f, 0]), 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];
const EXIF = segment(0xe1, [...text('Exif\0\0'), 0x4d, 0x4d, 0, 0x2a]);
const XMP = segment(0xe1, text('http://ns.adobe.com/xap/1.0/\0'));
const IPTC = segment(0xed, text('Photoshop 3.0\0'));
const COMMENT = segment(0xfe, text('Taken at home'));
const jpeg = (...parts: number[][]) => new Uint8Array(parts.flat());

beforeEach(() => {
  jest.clearAllMocks();
  forgetPhotoUrls();
});

describe('prepareChatPhoto', () => {
  it('scales the photo as Nutrition does, then leaves out every metadata segment', async () => {
    const taken = jpeg(SOI, JFIF, EXIF, XMP, ICC, IPTC, ADOBE, COMMENT, FRAME, TABLES, SCAN, EOI);
    jest.mocked(preparePhoto).mockResolvedValue({ mimeType: 'image/jpeg', data: toBase64(taken) });

    const data = await prepareChatPhoto('file:///cache/plate.jpg');

    expect(preparePhoto).toHaveBeenCalledWith('file:///cache/plate.jpg');
    expect(fromBase64(data)).toEqual(jpeg(SOI, JFIF, ICC, ADOBE, FRAME, TABLES, SCAN, EOI));
    expect(discardPhotos).toHaveBeenCalledWith(['file:///cache/plate.jpg']);
  });

  it('fails for a photo it cannot read, and still deletes it', async () => {
    jest.mocked(preparePhoto).mockResolvedValue({ mimeType: 'image/jpeg', data: btoa('PNG') });

    await expect(prepareChatPhoto('file:///cache/x.png')).rejects.toThrow();
    expect(discardPhotos).toHaveBeenCalledWith(['file:///cache/x.png']);
  });
});

it('gives the local time as HH:MM', () => {
  expect(localTime(new Date(2026, 9, 31, 7, 5))).toBe('07:05');
  expect(localTime(new Date(2026, 9, 31, 23, 59))).toBe('23:59');
});

it('sends photos as JPEG, unless they are too large', () => {
  expect(photosToSend(['AAAA'])).toEqual([{ mimeType: 'image/jpeg', data: 'AAAA' }]);
  const large = 'A'.repeat(Math.ceil((MAX_PHOTO_BYTES + 3) / 3) * 4);
  expect(photosToSend([large])).toEqual({ reason: 'photos_too_large' });
});

it("reads a stored message's photos by their paths, in order", () => {
  expect(
    messagePhotos([
      { type: 'image', path: 'u/1/a.jpg', mimeType: 'image/jpeg' },
      { type: 'text', text: 'Lunch' },
      { type: 'image', path: 'u/1/b.jpg', mimeType: 'image/jpeg' },
      { type: 'image' },
    ]),
  ).toEqual([{ path: 'u/1/a.jpg' }, { path: 'u/1/b.jpg' }]);
  expect(messagePhotos(null)).toEqual([]);
});

describe('photoUrls', () => {
  const createSignedUrls = jest.fn();

  beforeEach(() => {
    jest.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as never);
    createSignedUrls.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: `https://media.test/${path}` })),
        error: null,
      }),
    );
  });

  it('asks for the addresses of all photos at once, and only for those not known', async () => {
    const first = await photoUrls(['u/1/a.jpg', 'u/1/b.jpg', 'u/1/a.jpg']);
    expect(createSignedUrls).toHaveBeenCalledWith(['u/1/a.jpg', 'u/1/b.jpg'], 3600);
    expect(first.get('u/1/b.jpg')).toBe('https://media.test/u/1/b.jpg');

    await photoUrls(['u/1/a.jpg', 'u/1/c.jpg']);
    expect(createSignedUrls).toHaveBeenLastCalledWith(['u/1/c.jpg'], 3600);
  });

  it('asks again for an address about to end', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(0);
    await photoUrls(['u/1/a.jpg']);
    now.mockReturnValue(56 * 60 * 1000);
    await photoUrls(['u/1/a.jpg']);
    expect(createSignedUrls).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('fails when the addresses cannot be read', async () => {
    createSignedUrls.mockResolvedValue({ data: null, error: new Error('denied') });
    await expect(photoUrls(['u/1/a.jpg'])).rejects.toThrow('denied');
  });
});
