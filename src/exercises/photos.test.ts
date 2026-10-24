import { supabase } from '@/lib/supabase';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { isUserPhoto, uploadPhoto, usePictureUrls } from './photos';

jest.mock('@/exercises/images', () => ({
  exerciseImageUrl: (path: string) => `https://images.test/${path}`,
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-1111-1111-111111111111' }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => {
  const image = (width: number) => ({
    width,
    // "jpg" in base64, as the bytes of a JPEG this wide.
    saveAsync: jest.fn(() =>
      Promise.resolve({ uri: `file://small-${width}.jpg`, base64: btoa(`jpg${width}`) }),
    ),
  });
  const context = (width: number) => ({
    resize: () => ({ renderAsync: () => Promise.resolve(image(1080)) }),
    renderAsync: () => Promise.resolve(image(width)),
  });
  return {
    ImageManipulator: { manipulate: jest.fn(() => context(3000)) },
    SaveFormat: { JPEG: 'jpeg' },
  };
});
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn() }, storage: { from: jest.fn() } },
}));

const USER = '0000000a-0000-0000-0000-000000000000';
const PHOTO = `${USER}/11111111-1111-1111-1111-111111111111.jpg`;

beforeEach(() => jest.clearAllMocks());

describe('isUserPhoto', () => {
  it("tells a user's photo from a library picture", () => {
    expect(isUserPhoto(PHOTO)).toBe(true);
    expect(isUserPhoto('Barbell_Squat/0.webp')).toBe(false);
  });
});

describe('uploadPhoto', () => {
  it("shrinks the photo and uploads it to the user's folder", async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    jest.mocked(supabase.storage.from).mockReturnValue({ upload } as never);
    jest
      .mocked(supabase.auth.getSession)
      .mockResolvedValue({ data: { session: { user: { id: USER } } } } as never);
    await expect(uploadPhoto('file://big.jpg')).resolves.toBe(PHOTO);
    expect(supabase.storage.from).toHaveBeenCalledWith('exercise-photos');
    // The bytes of the shrunk photo, 1080 wide.
    expect(upload).toHaveBeenCalledWith(PHOTO, new TextEncoder().encode('jpg1080'), {
      contentType: 'image/jpeg',
    });
  });
});

describe('usePictureUrls', () => {
  it('signs the user photos and keeps the library pictures as they are', async () => {
    const createSignedUrls = jest.fn().mockResolvedValue({
      data: [{ path: PHOTO, signedUrl: 'https://signed.test/photo' }],
      error: null,
    });
    jest.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as never);
    const { result } = await renderHook(() => usePictureUrls(['Squat/0.webp', PHOTO]), {
      queryClient: createTestQueryClient(),
    });
    expect(result.current['Squat/0.webp']).toBe('https://images.test/Squat/0.webp');
    await waitFor(() => expect(result.current[PHOTO]).toBe('https://signed.test/photo'));
    expect(createSignedUrls).toHaveBeenCalledWith([PHOTO], 3600);
  });
});
