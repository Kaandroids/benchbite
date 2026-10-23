import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Card } from '@/components/ui/card';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { fonts, useTheme } from '@/theme';
import { exerciseImageUrl } from '@/workouts/workouts';

import { useExerciseDetails } from './library';

/**
 * How to do an exercise: its start and end pictures, the muscles it works, its equipment and
 * level, and the steps.
 */
export function ExerciseScreen({ id }: { id: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { library, instructions } = useExerciseDetails(id);
  const exercise = library.data?.find((candidate) => candidate.id === id);

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
        <MessageView
          icon="dumbbell"
          title={t('exercise.notFound.title')}
          message={t('exercise.notFound.message')}
        />
      </Screen>
    );
  }

  const pictures = exercise.imagePaths.slice(0, 2);
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

  return (
    <Screen
      onBack={() => router.back()}
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
        {pictures.map((path, index) => (
          <View key={path} style={[styles.picture, { gap: spacing.xs }]}>
            <Image
              source={{ uri: exerciseImageUrl(path) }}
              accessibilityLabel={index === 0 ? t('exercise.start') : t('exercise.end')}
              style={[
                styles.image,
                {
                  borderRadius: radii.lg,
                  borderColor: colors.border,
                  backgroundColor: colors.imageBackground,
                },
              ]}
            />
            {pictures.length > 1 ? (
              <Text variant="caption" color="textMuted" align="center" style={styles.chipText}>
                {index === 0 ? t('exercise.start') : t('exercise.end')}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <View style={[styles.wrap, { gap: spacing.xs }]}>
        {exercise.primaryMuscles.map((muscle) => chip(t(`workout.muscles.${muscle}`), true))}
        {exercise.secondaryMuscles.map((muscle) => chip(t(`workout.muscles.${muscle}`), false))}
      </View>

      <View style={[styles.row, { gap: spacing.sm }]}>
        {[
          {
            label: t('exercise.equipment'),
            value: t(`exercise.equipmentKinds.${exercise.equipment ?? 'other'}`),
          },
          { label: t('exercise.level'), value: t(`exercise.levels.${exercise.level}`) },
        ].map((fact) => (
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.extraBold,
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
