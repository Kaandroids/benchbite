import { readItem, writeItem } from '@/lib/device-storage';

import { forgetTermsOnDevice, readAccepted, readPutOff } from './kept-terms';

jest.mock('@/lib/device-storage', () => ({ readItem: jest.fn(), writeItem: jest.fn() }));

const stored = (value: string | null) => jest.mocked(readItem).mockReturnValue(value);

it('reads what was kept for this user, and nothing from a value of another shape', () => {
  stored(JSON.stringify({ userId: 'user-1', version: null }));
  expect(readAccepted('user-1')).toEqual({ userId: 'user-1', version: null });
  expect(readAccepted('guest-1')).toBeNull();
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
    expect(readAccepted('user-1')).toBeNull();
    expect(readPutOff('user-1')).toBeNull();
  }
});

it('forgets both with the user', () => {
  forgetTermsOnDevice();
  expect(writeItem).toHaveBeenCalledWith('terms-accepted', null);
  expect(writeItem).toHaveBeenCalledWith('terms-put-off', null);
});
