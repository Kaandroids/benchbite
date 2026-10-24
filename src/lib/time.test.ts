import { minutesAndSeconds } from './time';

describe('minutesAndSeconds', () => {
  it.each([
    [0, '0:00'],
    [45, '0:45'],
    [90, '1:30'],
    [600, '10:00'],
  ])('writes %i seconds as %s', (seconds, text) => {
    expect(minutesAndSeconds(seconds)).toBe(text);
  });
});
