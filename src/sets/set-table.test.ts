import { readSetValue, showSetValue } from './set-table';

describe('readSetValue', () => {
  it('reads weights to a quarter kilogram and other values as whole numbers', () => {
    expect(readSetValue('weightKg', '80,4')).toBe(80.5);
    expect(readSetValue('reps', '8.4')).toBe(8);
    expect(readSetValue('meters', '2000')).toBe(2000);
  });

  it('reads nothing for a value that rounds to nothing', () => {
    expect(readSetValue('reps', '0.4')).toBeNull();
    expect(readSetValue('weightKg', '0.1')).toBeNull();
    expect(readSetValue('meters', '0,3')).toBeNull();
  });

  it('reads nothing for no value, and the most a set holds for a larger one', () => {
    expect(readSetValue('reps', '')).toBeNull();
    expect(readSetValue('reps', 'abc')).toBeNull();
    expect(readSetValue('reps', '5000')).toBe(999);
  });
});

describe('showSetValue', () => {
  const german = new Intl.NumberFormat('de', { maximumFractionDigits: 2, useGrouping: false });
  const number = (value: number) => german.format(value);

  it('writes a number as the app language does, and a time as minutes and seconds', () => {
    expect(showSetValue('weightKg', 77.5, number)).toBe('77,5');
    expect(showSetValue('meters', 2000, number)).toBe('2000');
    expect(showSetValue('seconds', 90, number)).toBe('1:30');
  });

  it('shows nothing for no value', () => {
    expect(showSetValue('reps', null, number)).toBe('');
  });
});
