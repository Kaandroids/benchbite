import { Ellipse, Path } from 'react-native-svg';

import { BRAND_ORANGE } from '@/brand/mark';
import { Constants } from '@/lib/database.types';

/** Bite's colours: its plate, its features and its cheeks, as drawn on the brand's orange. */
export const PALETTE = {
  plate: '#FFFFFF',
  rim: '#FFD9C2',
  ink: '#16171A',
  blush: BRAND_ORANGE,
  flush: '#E5484D',
  tear: '#4E9BE0',
  tongue: '#FF6A7A',
};

/** The faces Bite answers with, which its messages keep (`bite_expression`, #291). */
export const ANSWER_EXPRESSIONS = Constants.public.Enums.bite_expression;

/** How Bite looks (#293): its face for what it says, and while it works out a reply. */
export const BITE_EXPRESSIONS = [...ANSWER_EXPRESSIONS, 'thinking'] as const;
export type BiteExpression = (typeof BITE_EXPRESSIONS)[number];

/** What Bite is doing (#293): waiting, working out a reply, saying it, or listening to the user. */
export const BITE_STATES = ['idle', 'thinking', 'talking', 'listening'] as const;
export type BiteState = (typeof BITE_STATES)[number];

/** Round eyes, which blink and look about; the happy face has closed ones instead. */
export type BiteEyes = {
  /** The centres of the left and the right eye. */
  left: number;
  right: number;
  cy: number;
  rx: number;
  ry: number;
  /** The white glint in each eye, from its centre. */
  glint?: { dx: number; dy: number; r: number };
};

/** A curved brow: its start, the curve's control point and its end, as x and y. */
export type Brow = readonly [number, number, number, number, number, number];

/** Raised brows, as surprised and listening have them. */
export const RAISED_BROWS: readonly [Brow, Brow] = [
  [31, 33, 37, 28, 43, 32],
  [57, 32, 63, 28, 69, 33],
];

/** The path of a brow, lifted by `lift`; a worklet, as the listening brows lift on the UI thread. */
export function browPath([x1, y1, cx, cy, x2, y2]: Brow, lift = 0) {
  'worklet';
  return `M${x1} ${y1 + lift} Q${cx} ${cy + lift} ${x2} ${y2 + lift}`;
}

export type Face = {
  eyes: BiteEyes | null;
  /** Everything else of the face that does not move: brows, cheeks, closed eyes, tears. */
  features: React.ReactNode;
  /** The mouth; null where the state draws a moving one. */
  mouth: React.ReactNode;
};

const cheeks = (opacity: number, rx = 5, ry = 3, cy = 55, color = PALETTE.blush) => (
  <>
    <Ellipse cx="29" cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} />
    <Ellipse cx="71" cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} />
  </>
);

const line = (d: string, width = 3) => (
  <Path d={d} fill="none" stroke={PALETTE.ink} strokeWidth={width} strokeLinecap="round" />
);

/** Each expression's face, drawn on the plate's 100 × 100 box, as approved on the canvas. */
export const FACES: Record<BiteExpression, Face> = {
  neutral: {
    eyes: { left: 38, right: 62, cy: 44, rx: 4.8, ry: 4.8, glint: { dx: 1.6, dy: -1.6, r: 1.6 } },
    features: cheeks(0.4),
    mouth: line('M42 60 Q50 67 58 60', 3.6),
  },
  happy: {
    eyes: null,
    features: (
      <>
        {line('M33 46 Q38 39 43 46', 3.6)}
        {line('M57 46 Q62 39 67 46', 3.6)}
        {cheeks(0.6, 5.5, 3.2)}
      </>
    ),
    mouth: (
      <>
        <Path d="M39 56 H61 Q61 72 50 72 Q39 72 39 56 Z" fill={PALETTE.ink} />
        <Ellipse cx="50" cy="68.4" rx="5" ry="2.6" fill={PALETTE.tongue} />
      </>
    ),
  },
  sad: {
    eyes: { left: 38, right: 62, cy: 46, rx: 4.4, ry: 4.4, glint: { dx: 1.4, dy: -1.4, r: 1.4 } },
    features: (
      <>
        {line('M31 37 L43 33')}
        {line('M57 33 L69 37')}
        <Path d="M33 52 Q30.5 56.5 33 58 Q35.5 56.5 33 52 Z" fill={PALETTE.tear} />
      </>
    ),
    mouth: line('M42 67 Q50 59.5 58 67', 3.6),
  },
  angry: {
    eyes: { left: 38, right: 62, cy: 45.5, rx: 4.6, ry: 3.4 },
    features: (
      <>
        {line('M31 34 L44 39', 3.4)}
        {line('M56 39 L69 34', 3.4)}
        {cheeks(0.45, 5.5, 3.2, 55, PALETTE.flush)}
      </>
    ),
    mouth: line('M41 65 Q50 60 59 65', 3.6),
  },
  surprised: {
    eyes: { left: 38, right: 62, cy: 44, rx: 6, ry: 6, glint: { dx: 2, dy: -2, r: 2 } },
    features: (
      <>
        {line(browPath(RAISED_BROWS[0]))}
        {line(browPath(RAISED_BROWS[1]))}
        {cheeks(0.4, 5, 3, 56)}
      </>
    ),
    mouth: <Ellipse cx="50" cy="64" rx="5.5" ry="7" fill={PALETTE.ink} />,
  },
  thinking: {
    eyes: { left: 40, right: 64, cy: 43, rx: 4.6, ry: 4.6, glint: { dx: 1.8, dy: -1.8, r: 1.5 } },
    features: (
      <>
        {line('M56 33 Q62 29 68 32')}
        {line('M32 36 L43 36')}
        {cheeks(0.4)}
      </>
    ),
    mouth: line('M44 63 Q50 61 57 61.5', 3.4),
  },
};

/**
 * How a live state changes the expression's face, while Bite moves: talking draws its own mouth,
 * and listening has wide eyes and cheeks of its own, its brows and mouth moving with its breath.
 */
export const STATE_FACES: Partial<Record<BiteState, Partial<Face>>> = {
  talking: { mouth: null },
  listening: {
    eyes: { left: 38, right: 62, cy: 44, rx: 5.4, ry: 5.4, glint: { dx: 1.8, dy: -1.8, r: 1.8 } },
    features: cheeks(0.45),
    mouth: null,
  },
};
