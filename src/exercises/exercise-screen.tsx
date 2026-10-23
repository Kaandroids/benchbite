import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';

import { useArchiveExercise } from './custom';
import { ExerciseNotFound } from './exercise-not-found';
import { useExerciseDetails } from './library';
import { usePictureUrls } from './photos';

/**
 * How to do an exercise: its start and end pictures, the muscles it works, its equipment and
 * level, and the steps. The user's own exercises are edited and archived from here.
 */
export function ExerciseScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { library, instructions } = useExerciseDetails(id);
  const exercise = library.data?.find((candidate) => candidate.id === id);
  // Each picture with its place, as the start may be missing before the end.
  const pictures = (exercise?.imagePaths.slice(0, 2) ?? []).flatMap((path, index) =>
    path ? [{ path, end: index === 1 }] : [],
  );
  const urls = usePictureUrls(pictures.map((picture) => picture.path));
  const archive = useArchiveExercise(id);

  if (!allLoaded([library, instructions])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[library, instructions]} />
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
      <Text variant="caption" color={primary ? 'primaryText' : 'textMuted'} style={styles.chipText}>
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
        console.warn('Could not archive the exercise', error);
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
        exercise.custom && !exercise.archived ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({ pathname: '/workout/exercise/edit', params: { id: exercise.id } })
            }
            style={({ pressed }) => [
              styles.edit,
              {
                borderRadius: radii.full,
                backgroundColor: colors.iconBackground,
                paddingHorizontal: spacing.md,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <Text variant="bodyStrong" color="primaryText" style={styles.title}>
              {t('workout.edit')}
            </Text>
          </Pressable>
        ) : undefined
      }
      // In the top bar, as on the other screens; long names take a second line.
      title={
        <Text
          variant="bodyStrong"
          accessibilityRole="header"
          align="center"
          numberOfLines={2}
          style={styles.title}
        >
          {exercise.name}
        </Text>
      }
    >
      <View style={[styles.row, { gap: spacing.sm }]}>
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
              <Text variant="caption" color="textMuted" align="center" style={styles.chipText}>
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
                <Text variant="caption" color="primaryText" style={styles.chipText}>
                  {index + 1}
                </Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {exercise.custom ? (
        <View style={[styles.archive, { gap: spacing.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: archive.isPending }}
            disabled={archive.isPending}
            onPress={() => (exercise.archived ? setArchived(false) : askToArchive())}
            style={styles.archiveButton}
          >
            <Text
              variant="bodyStrong"
              color={exercise.archived ? 'primaryText' : 'danger'}
              style={styles.title}
            >
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

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.extraBold,
  },
  edit: {
    height: 40,
    justifyContent: 'center',
  },
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
    borderWidth: 1,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: {
    fontFamily: fonts.extraBold,
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
