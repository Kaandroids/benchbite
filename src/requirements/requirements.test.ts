import { Platform } from 'react-native';

import { readItem, writeItem } from '@/lib/device-storage';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/providers/session-provider';
import { createTestQueryClient, renderHook, waitFor } from '@/test/render';

import { parseRequirements, useAgreementVersion, useRequirements } from './requirements';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('@/lib/device-storage', () => ({ readItem: jest.fn(), writeItem: jest.fn() }));
jest.mock('@/providers/session-provider', () => ({ useSession: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.0' }));

const ANSWER = {
  supported: true,
  lowestVersion: '1.2.0',
  agreements: {
    terms: {
      version: '2027-02-01',
      appliesAt: '2027-03-03T00:00:00+00:00',
      summary: { en: 'New' },
    },
    health_consent: { version: '2026-10-21', appliesAt: '2026-10-21T00:00:00+00:00', summary: {} },
    ai_consent: { version: '2026-11-18', appliesAt: '2026-11-18T00:00:00+00:00', summary: {} },
  },
};

const session = (status: string) => jest.mocked(useSession).mockReturnValue({ status } as never);
const server = (data: unknown, error: unknown = null) =>
  jest.mocked(supabase.rpc).mockResolvedValue({ data, error } as never);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(readItem).mockReturnValue(null);
  Platform.OS = 'ios';
  session('ready');
});

it('asks the server with the platform and this build’s version, and keeps the answer', async () => {
  server(ANSWER);
  const { result } = await renderHook(() => useRequirements());
  await waitFor(() => expect(result.current).toEqual(ANSWER));
  expect(supabase.rpc).toHaveBeenCalledWith('app_requirements', {
    platform: 'ios',
    app_version: '1.4.0',
  });
  expect(writeItem).toHaveBeenCalledWith('requirements', JSON.stringify(ANSWER));
});

it('goes on with the answer kept on the device while the server cannot be reached', async () => {
  jest.mocked(readItem).mockReturnValue(JSON.stringify({ ...ANSWER, lowestVersion: '1.0.0' }));
  server(null, { message: 'Network request failed' });
  const { result } = await renderHook(() => useRequirements());
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
  expect(result.current?.lowestVersion).toBe('1.0.0');
});

it('knows nothing, rather than stopping, with no answer and none kept', async () => {
  server(null, { message: 'Network request failed' });
  const { result } = await renderHook(() => useRequirements());
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
  expect(result.current).toBeUndefined();
});

it('does not ask before there is a session', async () => {
  session('loading');
  jest.mocked(readItem).mockReturnValue(JSON.stringify(ANSWER));
  const { result } = await renderHook(() => useRequirements());
  expect(supabase.rpc).not.toHaveBeenCalled();
  // What it last knew still holds.
  expect(result.current).toEqual(ANSWER);
});

it('does not take an answer it cannot read, nor keep it', async () => {
  server({ supported: 'yes' });
  const { result } = await renderHook(() => useRequirements());
  await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());
  expect(result.current).toBeUndefined();
  expect(writeItem).not.toHaveBeenCalled();
});

it('gives a text’s current version from the answer the app got, without asking itself', async () => {
  server(ANSWER);
  const queryClient = createTestQueryClient();
  const asked = await renderHook(() => useRequirements(), { queryClient });
  await waitFor(() => expect(asked.result.current).toEqual(ANSWER));

  const { result } = await renderHook(() => useAgreementVersion('terms'), { queryClient });
  expect(result.current).toBe('2027-02-01');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});

it('gives the version the build was made with while nothing is known', async () => {
  const { result } = await renderHook(() => useAgreementVersion('terms'));
  expect(result.current).toBe('2026-11-18');
  expect(supabase.rpc).not.toHaveBeenCalled();
});

it('reads an answer only with every text and the right kinds of values', () => {
  expect(parseRequirements(ANSWER)).toEqual(ANSWER);
  expect(parseRequirements({ ...ANSWER, supported: undefined })).toBeNull();
  expect(parseRequirements({ ...ANSWER, lowestVersion: 1 })).toBeNull();
  const { ai_consent: _, ...twoTexts } = ANSWER.agreements;
  expect(parseRequirements({ ...ANSWER, agreements: twoTexts })).toBeNull();
  expect(
    parseRequirements({
      ...ANSWER,
      agreements: { ...ANSWER.agreements, terms: { version: '', appliesAt: 'x', summary: {} } },
    }),
  ).toBeNull();
  // A summary that is not text in a language is left out, not refused.
  expect(
    parseRequirements({
      ...ANSWER,
      agreements: {
        ...ANSWER.agreements,
        terms: { ...ANSWER.agreements.terms, summary: { en: 'New', de: 5 } },
      },
    })?.agreements.terms.summary,
  ).toEqual({ en: 'New' });
});
