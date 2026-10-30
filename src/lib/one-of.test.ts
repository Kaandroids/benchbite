import { oneOf } from './one-of';

it('gives a value that is one of the options, and nothing else', () => {
  expect(oneOf(['a', 'b'] as const, 'b')).toBe('b');
  expect(oneOf(['a', 'b'] as const, 'c')).toBeUndefined();
  expect(oneOf(['a', 'b'] as const, undefined)).toBeUndefined();
});
