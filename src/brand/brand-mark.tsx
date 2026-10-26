import { useId } from 'react';
import Svg, { Circle, Defs, Mask, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';

import { BITE_CIRCLES, HOLE, MARK_BOX, PLATE, RING } from './mark';

type BrandMarkProps = {
  /** The width and height of the mark's box; the plate takes about two thirds of it. */
  size: number;
};

/**
 * The Benchbite mark, the bitten plate, cut out so that any background shows through. In the app
 * it takes the theme's orange, which keeps at least 3:1 with the background; the brighter brand
 * orange of the icon and the splash would not on the light background.
 */
export function BrandMark({ size }: BrandMarkProps) {
  const { colors } = useTheme();
  // Each mark needs its own mask, as several can be on screen at once.
  // React's ids contain colons, which do not work in an SVG url().
  const maskId = `brand-mark-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_BOX} ${MARK_BOX}`}
      accessibilityRole="image"
      accessibilityLabel="Benchbite"
    >
      <Defs>
        <Mask id={maskId} x={0} y={0} width={MARK_BOX} height={MARK_BOX}>
          <Circle cx={PLATE.cx} cy={PLATE.cy} r={PLATE.r} fill="#fff" />
          <Circle
            cx={PLATE.cx}
            cy={PLATE.cy}
            r={RING.r}
            fill="none"
            stroke="#000"
            strokeWidth={RING.width}
          />
          <Circle cx={PLATE.cx} cy={PLATE.cy} r={HOLE.r} fill="#000" />
          {BITE_CIRCLES.map((bite) => (
            <Circle
              key={`${bite.cx},${bite.cy}`}
              cx={bite.cx}
              cy={bite.cy}
              r={bite.r}
              fill="#000"
            />
          ))}
        </Mask>
      </Defs>
      <Rect width={MARK_BOX} height={MARK_BOX} fill={colors.primary} mask={`url(#${maskId})`} />
    </Svg>
  );
}
