import { useEffect, useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Mask, Path, Rect } from 'react-native-svg';

import {
  browPath,
  FACES,
  PALETTE,
  RAISED_BROWS,
  STATE_FACES,
  type BiteEyes,
  type BiteExpression,
  type BiteState,
  type Brow,
} from './bite-expressions';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Room around the plate's 100 × 100 box for the rings while listening, which reach past it; the
 * face keeps its size, as the room hangs over its neighbours.
 */
const ROOM = 20;

/** How far the eyes move to look aside, and how far the plate tilts with them, in degrees. */
const LOOK = 4;
const TILT = 6;

/** The crumbs off the bite, from the plate outwards: their place and size. */
const CRUMBS = [
  { cx: 98, cy: 31, r: 1.6 },
  { cx: 95, cy: 20, r: 2.5 },
  { cx: 88, cy: 9, r: 2 },
] as const;

const ease = Easing.inOut(Easing.quad);
/** A move to `to` over `duration` ms, after `delay` ms. */
const move = (to: number, duration: number, delay = 0) =>
  withDelay(delay, withTiming(to, { duration, easing: ease }));

export type BiteFaceProps = {
  size: number;
  expression?: BiteExpression;
} & (
  | {
      state?: 'idle';
      /**
       * Bored while it waits, as in the tab bar: every few seconds it looks to one side, then the
       * other, tilting with its eyes, and back.
       */
      looksAbout?: boolean;
    }
  | { state: Exclude<BiteState, 'idle'>; looksAbout?: never }
);

/**
 * Bite, the coach (#293): a bitten plate with a face, with one of its expressions and what it is
 * doing. Unless the user asks for less motion, it blinks now and then, its eyes look about and
 * its crumbs light up while it thinks, its mouth moves while it talks, and rings pulse while it
 * listens; with less motion, the expression stays still.
 */
export function BiteFace({
  size,
  expression = 'neutral',
  state = 'idle',
  looksAbout = false,
}: BiteFaceProps) {
  const reduceMotion = useReducedMotion();
  const mask = `bite-${useId()}`;
  // Talking without motion keeps the expression's own mouth.
  const talking = state === 'talking' && !reduceMotion;
  const face = {
    ...FACES[expression],
    ...(state === 'listening' || talking ? STATE_FACES[state] : undefined),
  };

  // From 1, open, to 0, shut.
  const blink = useSharedValue(1);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const tilt = useSharedValue(0);

  useEffect(() => {
    for (const value of [blink, lookX, lookY, tilt]) {
      cancelAnimation(value);
    }
    blink.set(1);
    lookX.set(0);
    lookY.set(0);
    tilt.set(0);
    if (reduceMotion) {
      return;
    }
    blink.set(
      withRepeat(
        withSequence(
          withDelay(3000, withTiming(0.12, { duration: 90 })),
          withTiming(1, { duration: 110 }),
        ),
        -1,
      ),
    );
    if (state === 'thinking') {
      // Up and to the right, then up and to the left, then back, every three seconds.
      lookX.set(
        withRepeat(withSequence(move(2.5, 600), move(-2, 450, 750), move(0, 450, 750)), -1),
      );
      lookY.set(withRepeat(withSequence(move(-2, 600), move(-2, 450, 750), move(0, 450, 750)), -1));
    } else if (state === 'listening') {
      tilt.set(
        withRepeat(withSequence(move(-5, 700), move(-5, 0, 700), move(3, 700), move(0, 700)), -1),
      );
    } else if (looksAbout) {
      const glances = (to: number) =>
        withRepeat(withSequence(move(-to, 380, 4000), move(to, 380, 900), move(0, 380, 900)), -1);
      lookX.set(glances(LOOK));
      tilt.set(glances(TILT));
    }
  }, [reduceMotion, state, looksAbout, blink, lookX, lookY, tilt]);

  const tiltStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));
  const span = size * (1 + (2 * ROOM) / 100);

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.room,
          { width: span, height: span, margin: (-size * ROOM) / 100 },
          tiltStyle,
        ]}
      >
        <Svg
          width={span}
          height={span}
          viewBox={`${-ROOM} ${-ROOM} ${100 + 2 * ROOM} ${100 + 2 * ROOM}`}
          accessible={false}
        >
          <Defs>
            {/* The bite out of the plate's edge; its id differs for each Bite on the screen. */}
            <Mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <Rect width="100" height="100" fill="#FFFFFF" />
              <Circle cx="81.4" cy="25.6" r="10" fill="#000000" />
              <Circle cx="67.3" cy="14.8" r="9" fill="#000000" />
              <Circle cx="89.6" cy="41.4" r="9" fill="#000000" />
            </Mask>
          </Defs>
          {state === 'listening' ? <Rings /> : null}
          <G mask={`url(#${mask})`}>
            <Circle cx="50" cy="52" r="38" fill={PALETTE.plate} />
            <Circle cx="50" cy="52" r="32" fill="none" stroke={PALETTE.rim} strokeWidth="3" />
          </G>
          <Crumbs thinking={state === 'thinking'} />
          {face.features}
          {state === 'listening' ? <ListeningFace /> : null}
          {face.eyes ? <Eyes eyes={face.eyes} blink={blink} lookX={lookX} lookY={lookY} /> : null}
          {face.mouth}
          {talking ? <TalkingMouth /> : null}
        </Svg>
      </Animated.View>
    </View>
  );
}

type EyesProps = {
  eyes: BiteEyes;
  blink: SharedValue<number>;
  lookX: SharedValue<number>;
  lookY: SharedValue<number>;
};

/** The two eyes, which blink and look about, each with its glint, hidden while it blinks. */
function Eyes(props: EyesProps) {
  return (
    <>
      <Eye {...props} cx={props.eyes.left} />
      <Eye {...props} cx={props.eyes.right} />
    </>
  );
}

function Eye({ eyes, blink, lookX, lookY, cx }: EyesProps & { cx: number }) {
  const eye = useAnimatedProps(() => ({
    cx: cx + lookX.get(),
    cy: eyes.cy + lookY.get(),
    ry: eyes.ry * blink.get(),
  }));
  const glint = useAnimatedProps(() => ({
    cx: cx + (eyes.glint?.dx ?? 0) + lookX.get(),
    cy: eyes.cy + (eyes.glint?.dy ?? 0) + lookY.get(),
    opacity: blink.get() > 0.5 ? 1 : 0,
  }));
  return (
    <>
      <AnimatedEllipse rx={eyes.rx} animatedProps={eye} fill={PALETTE.ink} />
      {eyes.glint ? (
        <AnimatedCircle r={eyes.glint.r} animatedProps={glint} fill={PALETTE.plate} />
      ) : null}
    </>
  );
}

/**
 * The crumbs off the bite, which light up and swell one after the other while Bite thinks: they
 * stay on its orange, where they show in either theme.
 */
function Crumbs({ thinking }: { thinking: boolean }) {
  const reduceMotion = useReducedMotion();
  const first = useSharedValue(1);
  const second = useSharedValue(1);
  const third = useSharedValue(1);
  const pulsing = thinking && !reduceMotion;
  useEffect(() => {
    [first, second, third].forEach((lit, index) => {
      cancelAnimation(lit);
      lit.set(pulsing ? 0.25 : 1);
      if (pulsing) {
        lit.set(
          withDelay(index * 200, withRepeat(withSequence(move(1, 600), move(0.25, 600)), -1)),
        );
      }
    });
  }, [pulsing, first, second, third]);
  return (
    <>
      <Crumb {...CRUMBS[0]} lit={first} swells={pulsing} />
      <Crumb {...CRUMBS[1]} lit={second} swells={pulsing} />
      <Crumb {...CRUMBS[2]} lit={third} swells={pulsing} />
    </>
  );
}

type CrumbProps = {
  cx: number;
  cy: number;
  r: number;
  lit: SharedValue<number>;
  swells: boolean;
};

function Crumb({ cx, cy, r, lit, swells }: CrumbProps) {
  const props = useAnimatedProps(() => ({
    opacity: lit.get(),
    r: swells ? r * (0.8 + 0.7 * lit.get()) : r,
  }));
  return <AnimatedCircle cx={cx} cy={cy} animatedProps={props} fill={PALETTE.plate} />;
}

/** The mouth while talking, opening and closing at the pace of speech. */
function TalkingMouth() {
  const talk = useSharedValue(0);
  useEffect(() => {
    talk.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1));
    return () => cancelAnimation(talk);
  }, [talk]);
  const props = useAnimatedProps(() => {
    const heights = [2, 7, 3.5, 8, 2.5, 6, 2];
    const widths = [8, 6.5, 7.5, 6, 8, 7, 8];
    const at = talk.get() * (heights.length - 1);
    const from = Math.floor(at);
    const to = Math.min(from + 1, heights.length - 1);
    const share = at - from;
    return {
      ry: heights[from]! + (heights[to]! - heights[from]!) * share,
      rx: widths[from]! + (widths[to]! - widths[from]!) * share,
    };
  });
  return <AnimatedEllipse cx="50" cy="61" animatedProps={props} fill={PALETTE.ink} />;
}

/** Listening: raised brows and a small round mouth, both moving with its breath. */
function ListeningFace() {
  const reduceMotion = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(breath);
    breath.set(0);
    if (!reduceMotion) {
      breath.set(withRepeat(move(1, 700), -1, true));
    }
  }, [reduceMotion, breath]);
  const mouth = useAnimatedProps(() => ({ ry: 3 + 1.2 * breath.get() }));
  return (
    <>
      <MovingBrow brow={RAISED_BROWS[0]} breath={breath} />
      <MovingBrow brow={RAISED_BROWS[1]} breath={breath} />
      <AnimatedEllipse cx="50" cy="62" rx="4" animatedProps={mouth} fill={PALETTE.ink} />
    </>
  );
}

function MovingBrow({ brow, breath }: { brow: Brow; breath: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ d: browPath(brow, -2 * breath.get()) }));
  return (
    <AnimatedPath
      animatedProps={props}
      fill="none"
      stroke={PALETTE.ink}
      strokeWidth="3"
      strokeLinecap="round"
    />
  );
}

/** Two rings that widen and fade from the plate while listening, one after the other. */
function Rings() {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(pulse);
    pulse.set(0);
    if (!reduceMotion) {
      pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
    }
  }, [reduceMotion, pulse]);
  return (
    <>
      <Ring pulse={pulse} offset={0} />
      <Ring pulse={pulse} offset={0.5} />
    </>
  );
}

function Ring({ pulse, offset }: { pulse: SharedValue<number>; offset: number }) {
  const props = useAnimatedProps(() => {
    const at = (pulse.get() + offset) % 1;
    return { r: 40 + 18 * at, opacity: 0.7 * (1 - at) };
  });
  return (
    <AnimatedCircle
      cx="50"
      cy="52"
      animatedProps={props}
      fill="none"
      stroke={PALETTE.plate}
      strokeWidth="2"
    />
  );
}

const styles = StyleSheet.create({
  room: {
    position: 'absolute',
  },
});
