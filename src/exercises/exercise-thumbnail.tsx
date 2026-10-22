import { Image, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { exerciseImageUrl } from '@/workouts/workouts';

type ExerciseThumbnailProps = {
  /** The exercise's first picture in the exercise-images bucket, if it has one. */
  path: string | null | undefined;
  size: number;
};

/** A square picture of an exercise, on white because the pictures are drawn on white. */
export function ExerciseThumbnail({ path, size }: ExerciseThumbnailProps) {
  const { colors, radii } = useTheme();
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: colors.imageBackground,
        },
      ]}
    >
      {path ? (
        <Image
          source={{ uri: exerciseImageUrl(path) }}
          style={styles.fill}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
});
