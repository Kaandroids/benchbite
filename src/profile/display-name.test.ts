import { displayNameOf } from './display-name';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('displayNameOf', () => {
  it('saves the name without the spaces around it', () => {
    expect(displayNameOf('  Kaan ')).toBe('Kaan');
    expect(displayNameOf('Ana Sofia')).toBe('Ana Sofia');
  });

  it('saves no name for nothing but spaces', () => {
    expect(displayNameOf('')).toBeNull();
    expect(displayNameOf('   ')).toBeNull();
  });
});
