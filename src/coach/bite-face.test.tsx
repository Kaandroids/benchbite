import { render, screen } from '@/test/render';

import type { BiteExpression } from './bite-expressions';
import { BiteFace, type BiteState } from './bite-face';

const EXPRESSIONS: BiteExpression[] = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'thinking'];
const STATES: BiteState[] = ['idle', 'thinking', 'talking', 'listening'];

/** The circles drawn, by their kind of host component. */
const drawn = (type: string) => screen.container.queryAll((node) => node.type === type).length;

describe('BiteFace', () => {
  it.each(EXPRESSIONS)('draws its %s face', async (expression) => {
    await render(<BiteFace size={88} expression={expression} />);
    // The bite's circles, the plate, its rim and its crumbs, then the face.
    expect(drawn('RNSVGCircle')).toBeGreaterThanOrEqual(8);
  });

  it.each(STATES)('draws itself %s', async (state) => {
    await render(<BiteFace size={88} state={state} />);
    expect(drawn('RNSVGCircle')).toBeGreaterThanOrEqual(8);
  });

  // Idle: the bite's three circles, the plate, its rim, its three crumbs and the neutral eyes' glints.
  it.each([
    ['idle', 10],
    ['thinking', 13],
    ['listening', 12],
  ] as const)(
    'adds the dots while thinking and the rings while listening: %s',
    async (state, n) => {
      await render(<BiteFace size={88} state={state} />);
      expect(drawn('RNSVGCircle')).toBe(n);
    },
  );

  it('keeps the space of its size, though it draws past it', async () => {
    await render(<BiteFace size={88} />);
    expect(
      screen.container.queryAll((node) => node.type === 'View' && node.props.style?.width === 88),
    ).toHaveLength(1);
  });
});
