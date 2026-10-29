import { Ellipse, Path } from 'react-native-svg';

/** The ink of Bite's features, and its cheeks, as drawn on the white plate. */
export const INK = '#16171A';
const BLUSH = '#FF6A10';
const FLUSH = '#E5484D';
const TEAR = '#4E9BE0';
const TONGUE = '#FF6A7A';

/** How Bite looks (ADR 0048, #293): its face for what it says. */
export type BiteExpression = 'neutral' | 'happy' | 'sad' | 'angry' | 'surprised' | 'thinking';

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

type Face = {
  eyes: BiteEyes | null;
  /** Everything else of the face that does not move: brows, cheeks, closed eyes, tears. */
  features: React.ReactNode;
  /** The mouth, which talking replaces with a moving one. */
  mouth: React.ReactNode;
};

const cheeks = (opacity: number, rx = 5, ry = 3, cy = 55, color = BLUSH) => (
  <>
    <Ellipse cx="29" cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} />
    <Ellipse cx="71" cy={cy} rx={rx} ry={ry} fill={color} opacity={opacity} />
  </>
);

const line = (d: string, width = 3) => (
  <Path d={d} fill="none" stroke={INK} strokeWidth={width} strokeLinecap="round" />
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
        <Path d="M39 56 H61 Q61 72 50 72 Q39 72 39 56 Z" fill={INK} />
        <Ellipse cx="50" cy="68.4" rx="5" ry="2.6" fill={TONGUE} />
      </>
    ),
  },
  sad: {
    eyes: { left: 38, right: 62, cy: 46, rx: 4.4, ry: 4.4, glint: { dx: 1.4, dy: -1.4, r: 1.4 } },
    features: (
      <>
        {line('M31 37 L43 33')}
        {line('M57 33 L69 37')}
        <Path d="M33 52 Q30.5 56.5 33 58 Q35.5 56.5 33 52 Z" fill={TEAR} />
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
        {cheeks(0.45, 5.5, 3.2, 55, FLUSH)}
      </>
    ),
    mouth: line('M41 65 Q50 60 59 65', 3.6),
  },
  surprised: {
    eyes: { left: 38, right: 62, cy: 44, rx: 6, ry: 6, glint: { dx: 2, dy: -2, r: 2 } },
    features: (
      <>
        {line('M31 33 Q37 28 43 32')}
        {line('M57 32 Q63 28 69 33')}
        {cheeks(0.4, 5, 3, 56)}
      </>
    ),
    mouth: <Ellipse cx="50" cy="64" rx="5.5" ry="7" fill={INK} />,
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

/** While listening, Bite's eyes are wide, its brows up and its mouth a small round one. */
export const LISTENING_EYES: BiteEyes = {
  left: 38,
  right: 62,
  cy: 44,
  rx: 5.4,
  ry: 5.4,
  glint: { dx: 1.8, dy: -1.8, r: 1.8 },
};

export const LISTENING_CHEEKS = cheeks(0.45);
