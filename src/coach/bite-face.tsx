import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Mask, Path, Rect } from 'react-native-svg';

const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

/** The plate's colours, as drawn on the brand's orange. */
const PLATE = '#FFFFFF';
const RIM = '#FFD9C2';
const INK = '#16171A';
const CHEEK = '#FF6A10';

const EYE = 4.8;

/**
 * Bite, the coach (#293): a bitten plate with a face, here with its neutral look. Unless the user
 * asks for less motion, it blinks now and then, so that it reads as alive.
 */
export function BiteFace({ size }: { size: number }) {
  const reduceMotion = useReducedMotion();
  const eye = useSharedValue(EYE);

  useEffect(() => {
    if (reduceMotion) {
      // Also when the user asks for less motion while it is moving.
      cancelAnimation(eye);
      eye.set(EYE);
      return;
    }
    eye.set(
      withRepeat(
        withSequence(
          withDelay(3000, withTiming(0.6, { duration: 90 })),
          withTiming(EYE, { duration: 110 }),
        ),
        -1,
      ),
    );
  }, [reduceMotion, eye]);

  const eyeProps = useAnimatedProps(() => ({ ry: eye.get() }));

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessible={false}>
      <Defs>
        {/* The bite out of the plate's edge. */}
        <Mask id="bite" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <Rect width="100" height="100" fill="#FFFFFF" />
          <Circle cx="81.4" cy="25.6" r="10" fill="#000000" />
          <Circle cx="67.3" cy="14.8" r="9" fill="#000000" />
          <Circle cx="89.6" cy="41.4" r="9" fill="#000000" />
        </Mask>
      </Defs>
      <G mask="url(#bite)">
        <Circle cx="50" cy="52" r="38" fill={PLATE} />
        <Circle cx="50" cy="52" r="32" fill="none" stroke={RIM} strokeWidth="3" />
      </G>
      <Circle cx="95" cy="20" r="2.5" fill={PLATE} />
      <Circle cx="88" cy="9" r="2" fill={PLATE} />
      <Circle cx="98" cy="31" r="1.6" fill={PLATE} />
      <Ellipse cx="29" cy="55" rx="5" ry="3" fill={CHEEK} opacity={0.4} />
      <Ellipse cx="71" cy="55" rx="5" ry="3" fill={CHEEK} opacity={0.4} />
      <AnimatedEllipse cx="38" cy="44" rx={EYE} animatedProps={eyeProps} fill={INK} />
      <AnimatedEllipse cx="62" cy="44" rx={EYE} animatedProps={eyeProps} fill={INK} />
      <Path
        d="M42 60 Q50 67 58 60"
        fill="none"
        stroke={INK}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}
