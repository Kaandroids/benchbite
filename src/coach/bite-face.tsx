import { useEffect } from 'react';
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
  FACES,
  INK,
  LISTENING_CHEEKS,
  LISTENING_EYES,
  type BiteEyes,
  type BiteExpression,
} from './bite-expressions';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);
const AnimatedPath = Animated.createAnimatedComponent(Path);

/** The plate's colours, as drawn on the brand's orange. */
const PLATE = '#FFFFFF';
const RIM = '#FFD9C2';

/**
 * Room around the plate's 100 × 100 box for what reaches past it, the rings while listening and
 * the dots while thinking; the face keeps its size, as the room hangs over its neighbours.
 */
const ROOM = 20;

/** How far the eyes move to look aside, and how far the plate tilts with them, in degrees. */
const LOOK = 4;
const TILT = 6;

/** What Bite is doing (#293): waiting, working out a reply, saying it, or listening to the user. */
export type BiteState = 'idle' | 'thinking' | 'talking' | 'listening';

type BiteFaceProps = {
  size: number;
  expression?: BiteExpression;
  state?: BiteState;
  /**
   * Bored while it waits, as in the tab bar: every few seconds it looks to one side, then the
   * other, tilting with its eyes, and back.
   */
  looksAbout?: boolean;
};

/**
 * Bite, the coach (#293): a bitten plate with a face, with one of its expressions and what it is
 * doing. Unless the user asks for less motion, it blinks now and then, its eyes look about while
 * it thinks, its mouth moves while it talks, and rings pulse while it listens.
 */
export function BiteFace({
  size,
  expression = 'neutral',
  state = 'idle',
  looksAbout = false,
}: BiteFaceProps) {
  const reduceMotion = useReducedMotion();
  const listening = state === 'listening';
  const face = FACES[expression];
  const eyes = listening ? LISTENING_EYES : face.eyes;

  // From 1, open, to 0, shut.
  const blink = useSharedValue(1);
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const tilt = useSharedValue(0);
  // From 0 to 1 and round again: the mouth while talking, the rings and breath while listening.
  const talk = useSharedValue(0);
  const pulse = useSharedValue(0);
  const breath = useSharedValue(0);
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  useEffect(() => {
    const dots = [dot1, dot2, dot3];
    const all = [blink, lookX, lookY, tilt, talk, pulse, breath, ...dots];
    for (const value of all) {
      cancelAnimation(value);
    }
    blink.set(1);
    lookX.set(0);
    lookY.set(0);
    tilt.set(0);
    talk.set(0);
    pulse.set(0);
    breath.set(0);
    for (const dot of dots) {
      dot.set(state === 'thinking' ? 0.25 : 0);
    }
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
    const ease = Easing.inOut(Easing.quad);
    const move = (to: number, duration: number, delay = 0) =>
      withDelay(delay, withTiming(to, { duration, easing: ease }));

    if (state === 'thinking') {
      // Up and to the right, then up and to the left, then back, every three seconds.
      lookX.set(
        withRepeat(withSequence(move(2.5, 600), move(-2, 450, 750), move(0, 450, 750)), -1),
      );
      lookY.set(withRepeat(withSequence(move(-2, 600), move(-2, 450, 750), move(0, 450, 750)), -1));
      dots.forEach((dot, index) =>
        dot.set(
          withDelay(index * 200, withRepeat(withSequence(move(1, 600), move(0.25, 600)), -1)),
        ),
      );
    } else if (state === 'talking') {
      talk.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1));
    } else if (listening) {
      pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1));
      breath.set(withRepeat(move(1, 700), -1, true));
      tilt.set(
        withRepeat(withSequence(move(-5, 700), move(-5, 0, 700), move(3, 700), move(0, 700)), -1),
      );
    } else if (looksAbout) {
      lookX.set(
        withRepeat(
          withSequence(move(-LOOK, 380, 4000), move(LOOK, 380, 900), move(0, 380, 900)),
          -1,
        ),
      );
      tilt.set(
        withRepeat(
          withSequence(move(-TILT, 380, 4000), move(TILT, 380, 900), move(0, 380, 900)),
          -1,
        ),
      );
    }
  }, [
    reduceMotion,
    state,
    listening,
    looksAbout,
    blink,
    lookX,
    lookY,
    tilt,
    talk,
    pulse,
    breath,
    dot1,
    dot2,
    dot3,
  ]);

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
            {/* The bite out of the plate's edge. */}
            <Mask id="bite" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <Rect width="100" height="100" fill="#FFFFFF" />
              <Circle cx="81.4" cy="25.6" r="10" fill="#000000" />
              <Circle cx="67.3" cy="14.8" r="9" fill="#000000" />
              <Circle cx="89.6" cy="41.4" r="9" fill="#000000" />
            </Mask>
          </Defs>
          {listening ? <Rings pulse={pulse} /> : null}
          <G mask="url(#bite)">
            <Circle cx="50" cy="52" r="38" fill={PLATE} />
            <Circle cx="50" cy="52" r="32" fill="none" stroke={RIM} strokeWidth="3" />
          </G>
          <Circle cx="95" cy="20" r="2.5" fill={PLATE} />
          <Circle cx="88" cy="9" r="2" fill={PLATE} />
          <Circle cx="98" cy="31" r="1.6" fill={PLATE} />
          {listening ? (
            <>
              {LISTENING_CHEEKS}
              <Brows breath={breath} />
            </>
          ) : (
            face.features
          )}
          {eyes ? <Eyes eyes={eyes} blink={blink} lookX={lookX} lookY={lookY} /> : null}
          {listening ? (
            <BreathingMouth breath={breath} />
          ) : state === 'talking' ? (
            <TalkingMouth talk={talk} />
          ) : (
            face.mouth
          )}
          {state === 'thinking' ? <Dots dots={[dot1, dot2, dot3]} /> : null}
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
      <AnimatedEllipse rx={eyes.rx} animatedProps={eye} fill={INK} />
      {eyes.glint ? <AnimatedCircle r={eyes.glint.r} animatedProps={glint} fill={PLATE} /> : null}
    </>
  );
}

/** The mouth while talking, opening and closing at the pace of speech. */
function TalkingMouth({ talk }: { talk: SharedValue<number> }) {
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
  return <AnimatedEllipse cx="50" cy="61" animatedProps={props} fill={INK} />;
}

/** The small round mouth while listening, as if holding its breath. */
function BreathingMouth({ breath }: { breath: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ ry: 3 + 1.2 * breath.get() }));
  return <AnimatedEllipse cx="50" cy="62" rx="4" animatedProps={props} fill={INK} />;
}

/** Raised brows while listening, lifting a little with each breath. */
function Brows({ breath }: { breath: SharedValue<number> }) {
  return (
    <>
      <Brow breath={breath} points={[31, 33, 37, 29, 43, 32]} />
      <Brow breath={breath} points={[57, 32, 63, 29, 69, 33]} />
    </>
  );
}

type BrowProps = {
  breath: SharedValue<number>;
  /** Its start, the curve's control point and its end, as x and y. */
  points: readonly [number, number, number, number, number, number];
};

function Brow({ breath, points: [x1, y1, cx, cy, x2, y2] }: BrowProps) {
  const props = useAnimatedProps(() => {
    const lift = -2 * breath.get();
    return { d: `M${x1} ${y1 + lift} Q${cx} ${cy + lift} ${x2} ${y2 + lift}` };
  });
  return (
    <AnimatedPath
      animatedProps={props}
      fill="none"
      stroke={INK}
      strokeWidth="3"
      strokeLinecap="round"
    />
  );
}

/** Two rings that widen and fade from the plate while listening, one after the other. */
function Rings({ pulse }: { pulse: SharedValue<number> }) {
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
      stroke={PLATE}
      strokeWidth="2"
    />
  );
}

/** Three dots rising from the bite while thinking, lighting up one after the other. */
function Dots({ dots }: { dots: readonly SharedValue<number>[] }) {
  return (
    <>
      {[
        [92, 2],
        [104, -6],
        [116, -14],
      ].map(([cx, cy], index) => (
        <Dot key={index} cx={cx!} cy={cy!} value={dots[index]!} />
      ))}
    </>
  );
}

function Dot({ cx, cy, value }: { cx: number; cy: number; value: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ opacity: value.get() }));
  return <AnimatedCircle cx={cx} cy={cy} r="4" animatedProps={props} fill={PLATE} />;
}

const styles = StyleSheet.create({
  room: {
    position: 'absolute',
  },
});
