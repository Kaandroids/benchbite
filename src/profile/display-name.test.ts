import { displayNameOf } from './display-name';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('displayNameOf', () => {
  it('saves the name without the spaces around it', () => {
    expect(displayNameOf('  Kaan ')).toBe('Kaan');
    expect(displayNameOf('Ana Sofia')).toBe('Ana Sofia');
  });

  it('turns pasted tabs and line breaks into spaces', () => {
    expect(displayNameOf('Kaan\tKara')).toBe('Kaan Kara');
    expect(displayNameOf('Kaan\n')).toBe('Kaan');
  });

  it('saves no name for nothing but spaces', () => {
    expect(displayNameOf('')).toBeNull();
    expect(displayNameOf('   ')).toBeNull();
  });
});
