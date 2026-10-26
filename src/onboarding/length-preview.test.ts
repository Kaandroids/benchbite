import { partMinutes } from './length-preview';

// The plan builder's client is not needed for the rounding.
jest.mock('./plan', () => ({ generatePlan: jest.fn() }));

describe('partMinutes', () => {
  it('rounds the parts so they add up to the rounded whole', () => {
    // 5 + 18.5 + 6.5 minutes: rounded one by one they would make 31.
    const time = { warmUp: 300, main: 1110, extras: 390, conditioning: 0 };
    expect(partMinutes(time)).toEqual({ warmUp: 5, main: 19, extras: 6, conditioning: 0 });
  });

  it('keeps whole minutes as they are', () => {
    const time = { warmUp: 300, main: 1260, extras: 780, conditioning: 300 };
    expect(partMinutes(time)).toEqual({ warmUp: 5, main: 21, extras: 13, conditioning: 5 });
  });
});
