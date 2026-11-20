import { readItem, writeItem } from '@/lib/device-storage';

import { forgetAgreementsOnDevice, readAgreed, readPutOff } from './kept-agreements';

jest.mock('@/lib/device-storage', () => ({ readItem: jest.fn(), writeItem: jest.fn() }));

const stored = (value: string | null) => jest.mocked(readItem).mockReturnValue(value);

it('reads what was kept for this user, and nothing from a value of another shape', () => {
  stored(JSON.stringify({ userId: 'user-1', version: null }));
  expect(readAgreed('terms', 'user-1')).toEqual({ userId: 'user-1', version: null });
  expect(readAgreed('terms', 'guest-1')).toBeNull();
  stored(JSON.stringify({ userId: 'user-1', version: '2027-02-01', day: '2027-02-10' }));
  expect(readPutOff('user-1')).toEqual({
    userId: 'user-1',
    version: '2027-02-01',
    day: '2027-02-10',
  });
  expect(readPutOff('guest-1')).toBeNull();
  expect(readPutOff(undefined)).toBeNull();

  for (const value of [null, 'not json', '"text"', '{"version":"2027-02-01"}', '{"userId":1}']) {
    stored(value);
    expect(readAgreed('terms', 'user-1')).toBeNull();
    expect(readPutOff('user-1')).toBeNull();
  }
});

it('forgets them all with the user', () => {
  forgetAgreementsOnDevice();
  expect(writeItem).toHaveBeenCalledWith('terms-accepted', null);
  expect(writeItem).toHaveBeenCalledWith('health-consent-given', null);
  expect(writeItem).toHaveBeenCalledWith('terms-put-off', null);
});
