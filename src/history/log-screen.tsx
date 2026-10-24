import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { HistoryButton } from '@/components/ui/history-button';
import { InfoButton } from '@/components/ui/info-button';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { thumbnailOf, useExerciseLibrary } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { shortSet, summarizeSets } from '@/sets/exercise-summary';
import { describeSet, setKindOf } from '@/sets/fields';
import type { SetValues } from '@/sets/values';
import { fonts, useTheme } from '@/theme';
import { useWorkoutName, workoutLength } from '@/workouts/format';

import { useTotalFormat } from './format';
import { byExercise, doneOf, useDeleteLog, useLoggedSets, useLogSummary } from './history';

// The width the buttons beside an exercise take, with the space before them.
const BUTTON_ROOM = 40;

/** One finished workout: when, how long and how hard, and every set that was done. */
export function LogScreen({ id }: { id: number }) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const summary = useLogSummary(id);
  const sets = useLoggedSets(id);
  const library = useExerciseLibrary();
  const remove = useDeleteLog();
  const workoutName = useWorkoutName();
  const { format } = useNumberFormat();
  const formatTotal = useTotalFormat();
  const log = summary.data;

  if (!allLoaded([summary, sets, library])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[summary, sets, library]} />
      </Screen>
    );
  }
  if (!log) {
    return (
      <Screen onBack={() => router.back()}>
        <MessageView
          icon="dumbbell"
          title={t('history.notFound.title')}
          message={t('history.notFound.message')}
        />
      </Screen>
    );
  }

  // "Friday, October 23" under the name in the top bar, with the year only when it is not this
  // one; when it started and ended is in the figures below.
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: log.startedAt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(log.startedAt);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const totalTime = workoutLength(
    Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 1000),
  );
  // The workout at a glance, quietly: the figures stand out by weight, not colour.
  const stats = [
    { value: totalTime, label: t('history.stats.time') },
    { value: doneOf(log.sets, log.plannedSets), label: t('history.stats.sets') },
    { value: format(Math.round(log.kilograms)), label: 'kg' },
    ...(log.estimatedKcal !== null
      ? [{ value: `~${format(log.estimatedKcal)}`, label: 'kcal' }]
      : []),
  ];

  const exercises = byExercise(sets.data ?? []);

  const onDelete = () =>
    Alert.alert(t('history.deleteTitle'), t('history.deleteMessage'), [
      { text: t('editor.cancel'), style: 'cancel' },
      {
        text: t('history.delete'),
        style: 'destructive',
        onPress: () =>
          void remove.mutateAsync(id).then(
            () => router.back(),
            (error: unknown) => {
              console.warn('Could not delete the workout log', error);
              Alert.alert(t('history.deleteErrorTitle'), t('history.deleteError'));
            },
          ),
      },
    ]);

  return (
    <Screen
      onBack={() => router.back()}
      action={
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/workout/log/edit', params: { id: String(log.id) } })
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
          <Text variant="bodyStrong" color="primaryText" style={styles.bold}>
            {t('workout.edit')}
          </Text>
        </Pressable>
      }
      title={
        <>
          <Text
            variant="bodyStrong"
            accessibilityRole="header"
            numberOfLines={1}
            style={styles.bold}
          >
            {workoutName(log)}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {day}
          </Text>
        </>
      }
    >
      {/* Four even columns, like the figures on a workout's screen, over when it started and ended. */}
      <View
        style={[
          styles.card,
          { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
      >
        <View style={[styles.row, { paddingVertical: spacing.md }]}>
          {stats.map((stat, index) => (
            <View
              key={stat.label}
              style={[
                styles.stat,
                { borderLeftWidth: index > 0 ? 1 : 0, borderLeftColor: colors.border },
              ]}
            >
              <Text variant="headline" style={styles.tabular}>
                {stat.value}
              </Text>
              <Text variant="caption" color="textMuted">
                {stat.label}
              </Text>
            </View>
          ))}
        </View>
        <View
          style={[
            styles.row,
            { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
          ]}
        >
          {[
            [t('history.started'), log.startedAt],
            [t('history.ended'), log.finishedAt],
          ].map(([label, at], index) => (
            <View
              key={String(label)}
              style={[
                styles.stat,
                styles.when,
                {
                  gap: spacing.xs,
                  borderLeftWidth: index > 0 ? 1 : 0,
                  borderLeftColor: colors.border,
                },
              ]}
            >
              <Text variant="caption" color="textMuted">
                {String(label)}
              </Text>
              <Text variant="bodyStrong" style={[styles.bold, styles.tabular]}>
                {time.format(at as Date)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {exercises.map((exercise, index) => {
        const info = library.data?.find((item) => item.id === exercise.exerciseId);
        const kind = setKindOf(info?.metrics, { reps: { min: 1, max: 1 } });
        const { best, total } = summarizeSets(exercise.sets, kind);
        const describe = (set: SetValues) => describeSet(set, kind);
        return (
          <View
            key={index}
            style={[
              styles.exercise,
              {
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            {/* Beside the name and over the sets' edge, so that the card keeps its height. */}
            <View style={[styles.buttons, { top: spacing.lg, right: spacing.lg, gap: spacing.sm }]}>
              <InfoButton exerciseId={exercise.exerciseId} exerciseName={info?.name ?? ''} />
              <HistoryButton exerciseId={exercise.exerciseId} exerciseName={info?.name ?? ''} />
            </View>
            <View style={[styles.row, { gap: spacing.md, paddingRight: BUTTON_ROOM }]}>
              <ExerciseThumbnail path={thumbnailOf(info)} size={44} name={info?.name} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.bold}>
                  {info?.name ?? ''}
                </Text>
                <Text variant="caption" color="textMuted" style={styles.semibold}>
                  {[
                    t('history.exercise.setCount', { count: exercise.sets.length }),
                    formatTotal(total),
                  ].join(' · ')}
                </Text>
              </View>
            </View>
            {/* Every set, the best one picked out. */}
            <View style={[styles.chips, { gap: spacing.xs, paddingRight: BUTTON_ROOM }]}>
              {exercise.sets.map((set, setIndex) => {
                const isBest = set === best;
                return (
                  <View
                    key={setIndex}
                    accessibilityLabel={
                      isBest ? `${t('history.exercise.best')}: ${describe(set)}` : undefined
                    }
                    style={[
                      styles.chip,
                      {
                        borderRadius: radii.md,
                        backgroundColor: isBest ? colors.selected : colors.background,
                      },
                    ]}
                  >
                    <Text
                      variant="caption"
                      color={isBest ? 'primaryText' : 'text'}
                      style={[styles.bold, styles.tabular]}
                    >
                      {shortSet(set, kind, describe)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: remove.isPending }}
        disabled={remove.isPending}
        onPress={onDelete}
        style={styles.delete}
      >
        <Text variant="bodyStrong" color="danger" style={styles.bold}>
          {t('history.delete')}
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  semibold: {
    fontFamily: fonts.bold,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  card: {
    borderWidth: 1,
  },
  when: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  exercise: {
    borderWidth: 1,
  },
  buttons: {
    position: 'absolute',
  },
  edit: {
    height: 40,
    justifyContent: 'center',
  },
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
