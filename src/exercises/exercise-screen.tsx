import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { PillButton } from '@/components/ui/pill-button';
import { Screen } from '@/components/ui/screen';
import { ScreenTitle } from '@/components/ui/screen-title';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { useArchiveExercise } from './custom';
import { ExerciseNotFound } from './exercise-not-found';
import { useExerciseDetails, findExercise } from './library';
import { ExerciseVideo } from './exercise-video';
import { MuscleMap } from './muscle-map';
import { usePictureUrls } from './photos';
import { useExerciseVideo } from './video';

/**
 * How to do an exercise: its video, else the muscles it works on the body from the front and the
 * back, or the start and end photos of the user's own exercise, its equipment and level, and the
 * steps. The user's own exercises are edited and archived from here, but not during a workout,
 * whose screen the editor would leave.
 */
export function ExerciseScreen({
  id,
  canEdit = true,
}: {
  id: string;
  /** Whether the user's own exercise can be edited and archived here. */
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { library, instructions } = useExerciseDetails(id);
  const exercise = findExercise(library.data, id);
  // Each photo with its place, as the start may be missing before the end. Only the user's own
  // exercises have photos; the others show their muscles on the body (ADR 0162).
  const pictures = (exercise?.imagePaths.slice(0, 2) ?? []).flatMap((path, index) =>
    path ? [{ path, end: index === 1 }] : [],
  );
  const urls = usePictureUrls(pictures.map((picture) => picture.path));
  const video = useExerciseVideo(id);
  // A video that cannot be read or played gives way to the map, as for an exercise without one.
  const [videoFailed, setVideoFailed] = useState(false);
  const onVideoError = useCallback(() => setVideoFailed(true), []);
  const shownVideo = videoFailed ? null : (video.data ?? null);
  const archive = useArchiveExercise(id);
  // The width of a map's tile, known once it is laid out; the figure is drawn to fit it.
  const [tileWidth, setTileWidth] = useState(0);
  // Inside the tile's border, with room around the figure.
  const mapSize = tileWidth - 2 * BORDER - 2 * spacing.sm;

  // Waits for the video too, also when trying again after it failed, so the map does not show
  // first and then make way for it.
  const videoLoading = video.isPending || (video.isError && video.isFetching);
  if (!allLoaded([library, instructions]) || videoLoading) {
    return (
      <Screen onBack={() => router.back()}>
        {/* The video while it loads, and when it failed with the others, so that trying again
            asks for it too; alone, a video that cannot be read is no error, the map shows. */}
        <LoadState
          queries={[library, instructions, ...(videoLoading || video.isError ? [video] : [])]}
        />
      </Screen>
    );
  }
  if (!exercise) {
    return (
      <Screen onBack={() => router.back()}>
        <ExerciseNotFound />
      </Screen>
    );
  }

  const chip = (label: string, primary: boolean) => (
    <View
      key={label}
      style={[
        styles.chip,
        {
          borderRadius: radii.sm,
          backgroundColor: primary ? colors.iconBackground : colors.track,
        },
      ]}
    >
      <Text variant="captionStrong" color={primary ? 'primaryText' : 'textMuted'}>
        {label}
      </Text>
    </View>
  );

  const setArchived = (archived: boolean) =>
    void archive.mutateAsync(archived).then(
      () => {
        if (archived) {
          router.back();
        }
      },
      (error: unknown) => {
        Alert.alert(t('customExercise.archiveErrorTitle'), t('customExercise.archiveError'));
      },
    );
  const askToArchive = () =>
    Alert.alert(t('customExercise.archiveTitle'), t('customExercise.archiveMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('customExercise.archive'),
        style: 'destructive',
        onPress: () => setArchived(true),
      },
    ]);
  const facts = [
    ...(exercise.equipment
      ? [
          {
            label: t('exercise.equipment'),
            value: t(`exercise.equipmentKinds.${exercise.equipment}`),
          },
        ]
      : []),
    { label: t('exercise.level'), value: t(`exercise.levels.${exercise.level}`) },
  ];

  return (
    <Screen
      onBack={() => router.back()}
      action={
        canEdit && exercise.custom && !exercise.archived ? (
          <PillButton
            label={t('workout.edit')}
            onPress={() =>
              router.push({ pathname: '/workout/exercise/edit', params: { id: exercise.id } })
            }
          />
        ) : undefined
      }
      // In the top bar, as on the other screens; long names take a second line.
      title={<ScreenTitle title={exercise.name} lines={2} />}
    >
      {shownVideo && pictures.length === 0 ? (
        <ExerciseVideo video={shownVideo} onError={onVideoError} />
      ) : null}
      <View style={[styles.row, { gap: spacing.sm }]}>
        {pictures.length === 0 && !shownVideo
          ? (['front', 'back'] as const).map((side) => (
              <View key={side} style={[styles.picture, { gap: spacing.xs }]}>
                <View
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={t(`exercise.${side}Map`)}
                  onLayout={(event) => setTileWidth(event.nativeEvent.layout.width)}
                  style={[
                    styles.image,
                    styles.map,
                    {
                      borderRadius: radii.lg,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  {tileWidth > 0 ? (
                    <MuscleMap
                      primary={exercise.primaryMuscles}
                      secondary={exercise.secondaryMuscles}
                      side={side}
                      width={mapSize}
                      height={mapSize}
                    />
                  ) : null}
                </View>
                <Text variant="captionStrong" color="textMuted" align="center">
                  {t(`exercise.${side}`)}
                </Text>
              </View>
            ))
          : null}
        {pictures.map(({ path, end }) => (
          <View key={path} style={[styles.picture, { gap: spacing.xs }]}>
            <Image
              source={urls[path] ? { uri: urls[path] } : undefined}
              accessibilityLabel={end ? t('exercise.end') : t('exercise.start')}
              style={[
                styles.image,
                {
                  borderRadius: radii.lg,
                  borderColor: colors.border,
                  backgroundColor: colors.imageBackground,
                },
              ]}
            />
            {/* A single start is just the picture of the exercise; an end is always named. */}
            {pictures.length > 1 || end ? (
              <Text variant="captionStrong" color="textMuted" align="center">
                {end ? t('exercise.end') : t('exercise.start')}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={[styles.wrap, { gap: spacing.xs }]}>
        {exercise.primaryMuscles.map((muscle) => chip(t(`workout.muscles.${muscle}`), true))}
        {exercise.secondaryMuscles.map((muscle) => chip(t(`workout.muscles.${muscle}`), false))}
        {exercise.custom ? chip(t('picker.filters.mine'), false) : null}
        {exercise.archived ? chip(t('customExercise.archived'), false) : null}
      </View>

      <View style={[styles.row, { gap: spacing.sm }]}>
        {facts.map((fact) => (
          <View
            key={fact.label}
            style={[
              styles.fact,
              {
                borderRadius: radii.md,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                padding: spacing.md,
              },
            ]}
          >
            <Text variant="caption" color="textMuted">
              {fact.label}
            </Text>
            <Text variant="bodyStrong">{fact.value}</Text>
          </View>
        ))}
      </View>

      {instructions.data && instructions.data.length > 0 ? (
        <Card>
          <Text variant="headline">{t('exercise.howTo')}</Text>
          {instructions.data.map((step, index) => (
            <View key={index} style={[styles.step, { gap: spacing.md }]}>
              <View style={[styles.number, { backgroundColor: colors.iconBackground }]}>
                <Text variant="captionStrong" color="primaryText">
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {canEdit && exercise.custom ? (
        <View style={[styles.archive, { gap: spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: archive.isPending }}
            disabled={archive.isPending}
            onPress={() => (exercise.archived ? setArchived(false) : askToArchive())}
            style={styles.archiveButton}
          >
            <Text variant="label" color={exercise.archived ? 'primaryText' : 'danger'}>
              {exercise.archived ? t('customExercise.restore') : t('customExercise.archive')}
            </Text>
          </Pressable>
          {exercise.archived ? null : (
            <Text variant="caption" color="textMuted" align="center">
              {t('customExercise.archiveNote')}
            </Text>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const BORDER = 1;

const styles = StyleSheet.create({
  archive: {
    alignItems: 'center',
  },
  archiveButton: {
    height: 44,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  picture: {
    flex: 1,
  },
  image: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: BORDER,
  },
  map: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  fact: {
    flex: 1,
    borderWidth: 1,
  },
  step: {
    flexDirection: 'row',
  },
  number: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    flex: 1,
  },
});
