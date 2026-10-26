import Animated, { useAnimatedProps, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { BITE, BITE_CIRCLES, CRUMBS, HOLE, MARK_BOX, PLATE, RING } from './mark';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type BittenPlateProps = {
  /** The width and height of the mark's box; the plate takes about two thirds of it. */
  size: number;
  color: string;
  /** The colour behind the plate. It must be one colour, as the cuts are drawn in it. */
  background: string;
  /** From 0, no bite, to 1, the whole bite; a little more makes it snap. */
  bite: SharedValue<number>;
  /** From 0 to 1 as the crumbs fly off the bite and fade. */
  crumbs: SharedValue<number>;
};

/** The Benchbite plate with a bite that can be taken out of it, as the splash screen does. */
export function BittenPlate({ size, color, background, bite, crumbs }: BittenPlateProps) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`} accessible={false}>
      <Circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} fill={color} />
      <Circle
        cx={PLATE.cx}
        cy={PLATE.cy}
        r={RING.r}
        fill="none"
        stroke={background}
        strokeWidth={RING.width}
      />
      <Circle cx={PLATE.cx} cy={PLATE.cy} r={HOLE.r} fill={background} />
      {BITE_CIRCLES.map((circle) => (
        <BiteCircle
          key={`${circle.cx},${circle.cy}`}
          circle={circle}
          progress={bite}
          color={background}
        />
      ))}
      {CRUMBS.map((crumb) => (
        <Crumb key={`${crumb.cx},${crumb.cy}`} crumb={crumb} progress={crumbs} color={color} />
      ))}
    </Svg>
  );
}

type BiteCircleProps = {
  circle: { cx: number; cy: number; r: number };
  progress: SharedValue<number>;
  color: string;
};

/** One circle of the bite, growing out of the bite's centre. */
function BiteCircle({ circle, progress, color }: BiteCircleProps) {
  const animatedProps = useAnimatedProps(() => {
    const size = progress.get();
    return {
      cx: BITE.cx + (circle.cx - BITE.cx) * size,
      cy: BITE.cy + (circle.cy - BITE.cy) * size,
      r: circle.r * size,
    };
  });
  return <AnimatedCircle animatedProps={animatedProps} fill={color} />;
}

type CrumbProps = {
  crumb: (typeof CRUMBS)[number];
  progress: SharedValue<number>;
  color: string;
};

/** A crumb that flies off the bite and fades. */
function Crumb({ crumb, progress, color }: CrumbProps) {
  const animatedProps = useAnimatedProps(() => {
    const flown = progress.get();
    return {
      cx: crumb.cx + crumb.dx * flown,
      cy: crumb.cy + crumb.dy * flown,
      opacity: flown === 0 ? 0 : Math.min(1, (1 - flown) * 2),
    };
  });
  return <AnimatedCircle animatedProps={animatedProps} r={crumb.r} fill={color} />;
}
