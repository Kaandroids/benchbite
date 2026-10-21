import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './icon';

type IconTileProps = {
  name: IconName;
  /** The tile's width and height; the icon is a little under half of it. */
  size?: number;
};

/** An icon on a tinted square, used to illustrate a point or a screen. */
export function IconTile({ name, size = 44 }: IconTileProps) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: size >= 64 ? radii.xl : radii.md,
          backgroundColor: colors.iconBackground,
        },
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.45)} color="primary" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
