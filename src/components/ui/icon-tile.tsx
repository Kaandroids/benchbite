import { StyleSheet, View } from 'react-native';

import { useTheme, type ColorTokens } from '@/theme';

import { Icon, type IconName } from './icon';

type IconTileProps = {
  name: IconName;
  /** The tile's width and height; the icon is a little under half of it. */
  size?: number;
  /** The icon's colour, on `background`; the brand's tint by default. */
  color?: keyof ColorTokens;
  background?: keyof ColorTokens;
};

/** An icon on a tinted square, used to illustrate a point or a screen. */
export function IconTile({
  name,
  size = 44,
  color = 'primary',
  background = 'iconBackground',
}: IconTileProps) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size >= 64 ? radii.xl : radii.md,
          backgroundColor: colors[background],
        },
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.45)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
