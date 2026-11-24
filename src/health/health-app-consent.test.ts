import { supabase } from '@/lib/supabase';

import {
  giveHealthAppConsent,
  hasHealthAppConsent,
  HEALTH_APP_CONSENT_VERSION,
  withdrawHealthAppConsent,
} from './health-app-consent';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));

beforeEach(() => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
});

it('records the consent with the server’s name of the store and the text’s version', async () => {
  await giveHealthAppConsent('healthConnect');
  expect(supabase.rpc).toHaveBeenCalledWith('give_health_app_consent', {
    store: 'health_connect',
    consent_version: HEALTH_APP_CONSENT_VERSION,
  });
});

it('throws when the consent was not recorded, so that the system is not asked', async () => {
  jest
    .mocked(supabase.rpc)
    .mockResolvedValue({ data: null, error: { code: 'BB067', message: 'no' } } as never);
  await expect(giveHealthAppConsent('appleHealth')).rejects.toMatchObject({ code: 'BB067' });
});

it('records the end of the consent', async () => {
  await withdrawHealthAppConsent();
  expect(supabase.rpc).toHaveBeenCalledWith('withdraw_health_app_consent');
});

it('holds only when the server says so', async () => {
  jest.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
  await expect(hasHealthAppConsent()).resolves.toBe(true);
  jest.mocked(supabase.rpc).mockResolvedValue({ data: false, error: null } as never);
  await expect(hasHealthAppConsent()).resolves.toBe(false);
});
