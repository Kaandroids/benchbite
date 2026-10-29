import { useReducedMotion } from 'react-native-reanimated';

import { render, screen } from '@/test/render';

import { BITE_EXPRESSIONS, BITE_STATES } from './bite-expressions';
import { BiteFace } from './bite-face';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: jest.fn() };
});

/** How many of a kind of host component are drawn. */
const drawn = (type: string) => screen.container.queryAll((node) => node.type === type).length;

beforeEach(() => jest.mocked(useReducedMotion).mockReturnValue(false));

describe('BiteFace', () => {
  // Cheeks, eyes and a round mouth are ellipses: each face draws its own number of them.
  it.each([
    ['neutral', 4],
    ['happy', 3],
    ['sad', 2],
    ['angry', 4],
    ['surprised', 5],
    ['thinking', 4],
  ] as const)('draws its %s face', async (expression, ellipses) => {
    await render(<BiteFace size={88} expression={expression} />);
    expect(drawn('RNSVGEllipse')).toBe(ellipses);
  });

  it('has a face for every expression and a drawing for every state', async () => {
    for (const expression of BITE_EXPRESSIONS) {
      for (const state of BITE_STATES) {
        await render(<BiteFace size={32} expression={expression} state={state} />);
        expect(drawn('RNSVGEllipse')).toBeGreaterThan(0);
      }
    }
  });

  it('talks with a moving mouth instead of its own', async () => {
    await render(<BiteFace size={88} state="talking" />);
    // The cheeks, the eyes and the talking mouth; no smile.
    expect(drawn('RNSVGEllipse')).toBe(5);
    expect(drawn('RNSVGPath')).toBe(0);
  });

  it('keeps its own mouth while talking with less motion', async () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    await render(<BiteFace size={88} expression="happy" state="talking" />);
    // The happy face's mouth and closed eyes, as when idle.
    expect(drawn('RNSVGEllipse')).toBe(3);
    expect(drawn('RNSVGPath')).toBe(3);
  });

  it('listens with rings round its plate, raised brows and a round mouth', async () => {
    await render(<BiteFace size={88} state="listening" />);
    // The bite's three circles, the plate and its rim, three crumbs, two glints and two rings.
    expect(drawn('RNSVGCircle')).toBe(12);
    expect(drawn('RNSVGPath')).toBe(2);
  });

  it('keeps the space of its size, though it draws past it', async () => {
    await render(<BiteFace size={88} />);
    expect(
      screen.container.queryAll((node) => node.type === 'View' && node.props.style?.width === 88),
    ).toHaveLength(1);
  });
});
