import { Image, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';
import { useUpperCase } from '@/i18n/case';

import { viewOf } from './body-map';
import { thumbnailOf, type LibraryExercise } from './library';
import { MuscleMap } from './muscle-map';
import { usePictureUrls } from './photos';

type ExerciseThumbnailProps = {
  /** The exercise, if it is known: its photo is shown, or else its muscles. */
  exercise: Pick<LibraryExercise, 'imagePaths' | 'primaryMuscles' | 'secondaryMuscles'> | undefined;
  size: number;
  /** Without a photo and without muscles, the first letter of the name stands in. */
  name?: string;
};

/**
 * What stands for an exercise in a list, in a square: the photo of the user's own exercise, or
 * the part of the body it trains (ADR 0162).
 */
export function ExerciseThumbnail({ exercise, size, name }: ExerciseThumbnailProps) {
  const upperCase = useUpperCase();
  const { colors, radii } = useTheme();
  const path = thumbnailOf(exercise);
  const url = usePictureUrls(path ? [path] : [])[path ?? ''];
  const primary = exercise ? exercise.primaryMuscles : [];
  const map = !path && primary.length > 0;
  const view = viewOf(primary);
  // Inside the frame's border.
  const inner = size - 2 * BORDER;
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: path ? colors.imageBackground : map ? colors.surface : colors.track,
        },
      ]}
    >
      {path ? (
        <Image
          source={url ? { uri: url } : undefined}
          style={styles.fill}
          accessibilityIgnoresInvertColors
        />
      ) : map ? (
        <MuscleMap
          primary={primary}
          secondary={exercise ? exercise.secondaryMuscles : []}
          side={view.side}
          zone={view.zone}
          width={inner}
          height={inner}
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

const BORDER = 1;

const styles = StyleSheet.create({
  frame: {
    borderWidth: BORDER,
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
