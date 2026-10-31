import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';
import { launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';

import { discardPhotos, pickPhotos, preparePhoto } from './photos';

jest.mock('expo-file-system', () => {
  const deleteFile = jest.fn();
  return {
    Paths: { cache: { uri: 'file:///cache/' } },
    File: jest.fn(() => ({ exists: true, delete: deleteFile })),
  };
});
jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: jest.fn() },
}));

const saveAsync = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  saveAsync.mockResolvedValue({ uri: 'file:///cache/scaled.jpg', base64: 'AAAA' });
  jest
    .mocked(ImageManipulator.manipulate)
    .mockReturnValue({ renderAsync: () => Promise.resolve({ saveAsync }) } as never);
});

describe('pickPhotos', () => {
  it('chooses up to three photos from the library', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }, { uri: 'd' }],
    } as never);
    await expect(pickPhotos('library', 3)).resolves.toEqual(['a', 'b', 'c']);
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3,
    });
  });

  it('gives none when the camera is not allowed', async () => {
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await expect(pickPhotos('camera', 3)).resolves.toEqual([]);
  });

  it('chooses one photo alone when only one is wanted', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'a' }],
    } as never);
    await expect(pickPhotos('library', 1)).resolves.toEqual(['a']);
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });
  });
});

describe('preparePhoto', () => {
  it('scales a photo down to a JPEG and deletes the scaled copy once read', async () => {
    await expect(preparePhoto('file://one.jpg')).resolves.toEqual({
      mimeType: 'image/jpeg',
      data: 'AAAA',
    });
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file://one.jpg', {
      maxWidth: 1024,
      maxHeight: 1024,
    });
    expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
    expect(File).toHaveBeenCalledWith('file:///cache/scaled.jpg');
  });
});

describe('discardPhotos', () => {
  it("deletes photos in the app's cache folder only", () => {
    discardPhotos(['file:///cache/ImagePicker/a.jpg', 'file:///photos/b.jpg']);
    expect(File).toHaveBeenCalledTimes(1);
    expect(File).toHaveBeenCalledWith('file:///cache/ImagePicker/a.jpg');
  });
});
