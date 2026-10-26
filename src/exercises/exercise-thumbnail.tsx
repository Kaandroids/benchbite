import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';
import { useUpperCase } from '@/i18n/case';

import { usePictureUrls } from './photos';

type ExerciseThumbnailProps = {
  /** The exercise's first picture, of the library or the user's photo, if it has one. */
  path: string | null | undefined;
  size: number;
  /** Without a picture, as for the user's own exercises, its first letter stands in. */
  name?: string;
};

/** A square picture of an exercise, on white because the pictures are drawn on white. */
export function ExerciseThumbnail({ path, size, name }: ExerciseThumbnailProps) {
  const upperCase = useUpperCase();
  const { colors, radii } = useTheme();
  const url = usePictureUrls(path ? [path] : [])[path ?? ''];
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: path || !name ? colors.imageBackground : colors.track,
        },
      ]}
    >
      {path ? (
        <Image
          source={url ? { uri: url } : undefined}
          style={styles.fill}
          accessibilityIgnoresInvertColors
        />
      ) : name ? (
        <Text
          color="textMuted"
          importantForAccessibility="no"
          style={[styles.initial, { fontSize: size * 0.4, lineHeight: size * 0.5 }]}
        >
          {upperCase(name.trim().charAt(0))}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  initial: {
    fontFamily: fonts.black,
  },
});
