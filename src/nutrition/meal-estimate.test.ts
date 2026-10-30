import { ImageManipulator } from 'expo-image-manipulator';
import { launchImageLibraryAsync, requestCameraPermissionsAsync } from 'expo-image-picker';

import {
  confidenceOf,
  EstimateFailure,
  estimateMeal,
  estimateTotals,
  pickMealPhotos,
  type EstimateItem,
} from './meal-estimate';

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'token' } } }),
    },
  },
  functionUrl: (name: string) => `https://example.test/functions/v1/${name}`,
  publishableKey: 'key',
}));
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
  saveAsync.mockResolvedValue({ base64: 'AAAA' });
  jest
    .mocked(ImageManipulator.manipulate)
    .mockReturnValue({ renderAsync: () => Promise.resolve({ saveAsync }) } as never);
});

describe('pickMealPhotos', () => {
  it('chooses up to three photos from the library', async () => {
    jest.mocked(launchImageLibraryAsync).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'a' }, { uri: 'b' }, { uri: 'c' }, { uri: 'd' }],
    } as never);
    await expect(pickMealPhotos('library')).resolves.toEqual(['a', 'b', 'c']);
    expect(launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3,
    });
  });

  it('gives none when the camera is not allowed', async () => {
    jest.mocked(requestCameraPermissionsAsync).mockResolvedValue({ granted: false } as never);
    await expect(pickMealPhotos('camera')).resolves.toEqual([]);
  });
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
