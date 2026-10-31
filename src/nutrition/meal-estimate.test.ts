import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';

import {
  confidenceOf,
  EstimateFailure,
  estimateMeal,
  estimateTotals,
  type EstimateItem,
} from './meal-estimate';

jest.mock('@/lib/supabase', () => ({
  functionUrl: (name: string) => `https://example.test/functions/v1/${name}`,
  functionHeaders: () => Promise.resolve({ apikey: 'key', authorization: 'Bearer token' }),
}));
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

const RICE: EstimateItem = {
  name: 'Rice',
  searchName: 'Rice, boiled',
  grams: 200,
  confidence: 0.9,
  food: { ref: { kind: 'library', id: 'C352032' }, name: 'Rice, boiled' },
  per100: { kcal: 117, proteinG: 2.5, carbsG: 25, fatG: 0.3 },
  estimated: false,
};

const CHUTNEY: EstimateItem = {
  name: 'Mango chutney',
  searchName: 'Mango chutney',
  grams: 20,
  confidence: 0.3,
  per100: { kcal: 233, proteinG: 0.5, carbsG: 57, fatG: 0.3 },
  estimated: true,
};

function respond(status: number, body: unknown) {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: status < 300,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  saveAsync.mockResolvedValue({ uri: 'file:///cache/scaled.jpg', base64: 'AAAA' });
  jest
    .mocked(ImageManipulator.manipulate)
    .mockReturnValue({ renderAsync: () => Promise.resolve({ saveAsync }) } as never);
});

describe('estimateMeal', () => {
  it('sends the photos scaled down, with the meal and a correction', async () => {
    respond(200, { isFood: true, items: [RICE] });

    const estimate = await estimateMeal({
      photos: ['file://one.jpg'],
      language: 'de',
      meal: 'lunch',
      correction: { note: 'Half the rice', previous: [{ name: 'Rice', grams: 200 }] },
    });

    expect(estimate.items).toEqual([RICE]);
    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file://one.jpg', {
      maxWidth: 1024,
      maxHeight: 1024,
    });
    expect(saveAsync).toHaveBeenCalledWith({ format: 'jpeg', compress: 0.7, base64: true });
    const [url, init] = jest.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toBe('https://example.test/functions/v1/estimate-meal');
    expect(init?.headers).toMatchObject({ authorization: 'Bearer token', apikey: 'key' });
    expect(JSON.parse(init?.body as string)).toEqual({
      photos: [{ mimeType: 'image/jpeg', data: 'AAAA' }],
      language: 'de',
      meal: 'lunch',
      note: 'Half the rice',
      previous: [{ name: 'Rice', grams: 200 }],
    });
  });

  it('deletes the scaled copy once it is read', async () => {
    respond(200, { isFood: true, items: [RICE] });
    await estimateMeal({ photos: ['file:///cache/a.jpg'], language: 'en', meal: 'lunch' });
    expect(File).toHaveBeenCalledWith('file:///cache/scaled.jpg');
  });

  it('fails before the request when a photo cannot be prepared', async () => {
    respond(200, { isFood: true, items: [RICE] });
    saveAsync.mockResolvedValue({ uri: 'file:///cache/scaled.jpg' });
    await expect(
      estimateMeal({ photos: ['file:///cache/a.jpg'], language: 'en', meal: 'lunch' }),
    ).rejects.toThrow('The scaled photo came without its data');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('fails with the reason the function gives', async () => {
    respond(429, { error: 'limit_reached' });
    const failure = await estimateMeal({ photos: ['a'], language: 'en', meal: 'lunch' }).catch(
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(EstimateFailure);
    expect((failure as EstimateFailure).refusal).toBe('limit_reached');
  });

  it('fails as unavailable for an answer it cannot read', async () => {
    respond(502, 'Bad gateway');
    const failure = (await estimateMeal({ photos: ['a'], language: 'en', meal: 'lunch' }).catch(
      (error: unknown) => error,
    )) as EstimateFailure;
    expect(failure.reason).toBe('unavailable');
    expect(failure.refusal).toBeUndefined();
    // What the log needs to tell why.
    expect([failure.status, failure.detail]).toEqual([502, 'Bad gateway']);
  });
});

describe('estimateTotals', () => {
  it('adds up what each item gives at its grams', () => {
    const totals = estimateTotals([RICE, CHUTNEY]);
    expect(Math.round(totals.calories)).toBe(234 + 47);
    expect(Math.round(totals.carbsG)).toBe(50 + 11);
  });
});

describe('confidenceOf', () => {
  it('weighs each item by its calories', () => {
    // The unsure chutney is a small part of the plate.
    expect(confidenceOf([RICE, CHUTNEY])).toBe('high');
    expect(confidenceOf([{ ...RICE, confidence: 0.6 }])).toBe('medium');
    expect(confidenceOf([CHUTNEY])).toBe('low');
  });
});
