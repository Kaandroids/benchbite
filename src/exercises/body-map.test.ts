import { mapParts, placement, viewOf, ZONES } from './body-map';

const COLORS = { primary: 'orange', secondary: 'pale', rest: 'grey' };
const colorOf = (parts: { slug: string; color: string }[], slug: string) =>
  parts.find((part) => part.slug === slug)?.color;

describe('mapParts', () => {
  it('colours the muscles trained first, the ones that help, and the rest', () => {
    const parts = mapParts(['quadriceps'], ['glutes', 'calves'], COLORS);
    expect(colorOf(parts, 'quadriceps')).toBe('orange');
    expect(colorOf(parts, 'gluteal')).toBe('pale');
    expect(colorOf(parts, 'calves')).toBe('pale');
    expect(colorOf(parts, 'chest')).toBe('grey');
    expect(colorOf(parts, 'head')).toBe('grey');
  });

  it('draws a part once, in the colour of the muscles trained first', () => {
    // Lats and the middle back share the upper back of the drawing.
    const parts = mapParts(['lats'], ['middle back'], COLORS);
    expect(parts.filter((part) => part.slug === 'upper-back')).toHaveLength(1);
    expect(colorOf(parts, 'upper-back')).toBe('orange');
  });

  it('fills both parts of the abdominals', () => {
    const parts = mapParts(['abdominals'], [], COLORS);
    expect(colorOf(parts, 'abs')).toBe('orange');
    expect(colorOf(parts, 'obliques')).toBe('orange');
  });

  it('draws the whole body without muscles', () => {
    expect(new Set(mapParts([], [], COLORS).map((part) => part.color))).toEqual(new Set(['grey']));
  });
});

describe('viewOf', () => {
  it('looks where the first muscle trained is', () => {
    expect(viewOf(['quadriceps', 'glutes'])).toEqual({ side: 'front', zone: 'legs' });
    expect(viewOf(['lats'])).toEqual({ side: 'back', zone: 'upper' });
    expect(viewOf(['calves'])).toEqual({ side: 'back', zone: 'lower' });
  });

  it('shows the whole figure from the front without a muscle', () => {
    expect(viewOf([])).toEqual({ side: 'front', zone: 'whole' });
  });
});

describe('placement', () => {
  it('fills a square box with a square zone', () => {
    const [x, y, w] = ZONES.upper;
    const { scale, left, top } = placement('upper', 60, 60);
    const pointsPerUnit = 60 / w;
    expect(scale).toBeCloseTo((724 * pointsPerUnit) / 200);
    expect(left).toBeCloseTo(-x * pointsPerUnit);
    expect(top).toBeCloseTo(-y * pointsPerUnit);
  });

  it('centres the whole figure in a box wider than it', () => {
    const [x, y, w, h] = ZONES.whole;
    const { left, top } = placement('whole', 150, 150);
    const pointsPerUnit = 150 / h;
    expect(top).toBeCloseTo(-y * pointsPerUnit);
    expect(left).toBeCloseTo((150 - w * pointsPerUnit) / 2 - x * pointsPerUnit);
  });
});
