import i18n from '@/i18n';
import { act, renderHook } from '@/test/render';

import { useUpperCase } from './case';

afterEach(() => act(() => i18n.changeLanguage('en')));

describe('useUpperCase', () => {
  it('follows the app language, not the device', async () => {
    const { result } = await renderHook(useUpperCase);
    expect(result.current('main muscles')).toBe('MAIN MUSCLES');
    await act(() => i18n.changeLanguage('tr'));
    expect(result.current('dil')).toBe('DİL');
  });
});
