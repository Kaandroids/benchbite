import { heartRateSamples } from './samples';

const FROM = new Date('2026-11-06T18:04:00Z');
const at = (seconds: number) => new Date(FROM.getTime() + seconds * 1000);

it('averages the samples of each 10 seconds, with none where the store had none', () => {
  expect(
    heartRateSamples(
      [
        { at: at(1), bpm: 100 },
        { at: at(9), bpm: 105 },
        { at: at(25), bpm: 130.26 },
      ],
      FROM,
      at(40),
    ),
  ).toEqual([102.5, null, 130.3, null, null]);
});

it('leaves out samples before the start or after the end, and those that are no number', () => {
  expect(
    heartRateSamples(
      [
        { at: at(-5), bpm: 90 },
        { at: at(55), bpm: 150 },
        { at: at(3), bpm: Number.NaN },
        { at: at(12), bpm: 120 },
      ],
      FROM,
      at(20),
    ),
  ).toEqual([null, 120, null]);
});

it('gives none without a sample between the times', () => {
  expect(heartRateSamples([{ at: at(-5), bpm: 90 }], FROM, at(20))).toBeNull();
});

it('keeps at most 4320, a 12-hour workout one value short', () => {
  expect(heartRateSamples([{ at: at(0), bpm: 90 }], FROM, at(12 * 3600))).toHaveLength(4320);
});
