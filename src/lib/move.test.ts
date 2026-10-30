import { move } from './move';

it('moves an item to another place, leaving the given list as it is', () => {
  const items = ['a', 'b', 'c'];
  expect(move(items, 0, 2)).toEqual(['b', 'c', 'a']);
  expect(move(items, 2, 0)).toEqual(['c', 'a', 'b']);
  expect(items).toEqual(['a', 'b', 'c']);
});

it('keeps the items when there is none at the place to move from', () => {
  expect(move(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
});
