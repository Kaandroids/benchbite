import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { useExerciseLibrary } from '@/exercises/library';
import { useNumberFormat } from '@/i18n/units';
import { describeSet, setKindOf } from '@/sessions/fields';
import type { SetValues } from '@/sessions/session';
import { fonts, useTheme } from '@/theme';
import { minutesAndSeconds, useWorkoutName } from '@/workouts/format';

import {
  doneOf,
  durationMinutes,
  useDeleteLog,
  useLoggedSets,
  useLogSummary,
  type LoggedSet,
} from './history';
import { shortSet, summarizeSets } from './exercise-summary';

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

  // "Friday, October 23 · 18:04 – 18:56", with the year only when it is not this one.
  const day = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: log.startedAt.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(log.startedAt);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const hours = time.formatRange
    ? time.formatRange(log.startedAt, log.finishedAt)
    : `${time.format(log.startedAt)} – ${time.format(log.finishedAt)}`;
  const seconds = Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 1000);
  const totalTime =
    seconds < 3600
      ? minutesAndSeconds(seconds)
      : `${Math.floor(durationMinutes(log) / 60)}:${String(durationMinutes(log) % 60).padStart(2, '0')} h`;
  // The workout at a glance, quietly: the figures stand out by weight, not colour.
  const stats = [
    { value: totalTime, label: t('history.stats.time') },
    { value: doneOf(log.sets, log.plannedSets), label: t('history.stats.sets') },
    { value: format(Math.round(log.kilograms)), label: 'kg' },
    ...(log.estimatedKcal !== null
      ? [{ value: `~${format(log.estimatedKcal)}`, label: 'kcal' }]
      : []),
  ];

  // The sets of each exercise, in the order the exercises were done.
  const exercises: { exerciseId: string; sets: LoggedSet[] }[] = [];
  for (const set of sets.data ?? []) {
    const last = exercises[exercises.length - 1];
    if (
      last &&
      last.exerciseId === set.exerciseId &&
      last.sets[0]?.exercisePosition === set.exercisePosition
    ) {
      last.sets.push(set);
    } else {
      exercises.push({ exerciseId: set.exerciseId, sets: [set] });
    }
  }

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
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">
          {workoutName(log)}
        </Text>
        <Text color="textMuted">{`${day} · ${hours}`}</Text>
        <View style={[styles.stats, { columnGap: spacing.md, marginTop: spacing.xs }]}>
          {stats.map((stat) => (
            <Text key={stat.label} color="textMuted" style={styles.semibold}>
              <Text style={[styles.bold, styles.tabular]}>{stat.value}</Text> {stat.label}
            </Text>
          ))}
        </View>
      </View>

      {exercises.map((exercise, index) => {
        const info = library.data?.find((item) => item.id === exercise.exerciseId);
        const kind = setKindOf(info?.metrics, { reps: { min: 1, max: 1 } });
        const { best, total } = summarizeSets(exercise.sets, kind);
        const describe = (set: SetValues) => describeSet(set, kind);
        const totals = {
          volume: [
            t('history.exercise.volume'),
            `${format(Math.round(total.kind === 'volume' ? total.kilograms : 0))} kg`,
          ],
          reps: [
            t('history.exercise.totalReps'),
            t('history.exercise.reps', { count: total.kind === 'reps' ? total.reps : 0 }),
          ],
          time: [
            t('history.exercise.totalTime'),
            minutesAndSeconds(total.kind === 'time' ? total.seconds : 0),
          ],
          distance: [
            t('history.exercise.totalDistance'),
            `${format(total.kind === 'distance' ? total.meters : 0)} m`,
          ],
        } as const;
        const [totalLabel, totalValue] = totals[total.kind];
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
            <View style={[styles.row, { gap: spacing.md }]}>
              <ExerciseThumbnail path={info?.imagePaths[0]} size={44} />
              <View style={styles.flex}>
                <Text variant="bodyStrong" style={styles.bold}>
                  {info?.name ?? ''}
                </Text>
                <Text variant="caption" color="textMuted" style={styles.semibold}>
                  {t('history.exercise.setCount', { count: exercise.sets.length })}
                </Text>
              </View>
            </View>
            <View style={[styles.row, { gap: spacing.sm }]}>
              <View
                style={[styles.box, { borderRadius: radii.md, backgroundColor: colors.selected }]}
              >
                <Text variant="caption" color="primaryText" style={styles.bold}>
                  {t('history.exercise.best')}
                </Text>
                <Text variant="headline">{best ? describe(best) : '—'}</Text>
              </View>
              <View
                style={[styles.box, { borderRadius: radii.md, backgroundColor: colors.background }]}
              >
                <Text variant="caption" color="textMuted" style={styles.bold}>
                  {totalLabel}
                </Text>
                <Text variant="headline">{totalValue}</Text>
              </View>
            </View>
            <Text color="textMuted" style={styles.semibold}>
              {exercise.sets.map((set) => shortSet(set, kind, describe)).join(' · ')}
            </Text>
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
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  exercise: {
    borderWidth: 1,
  },
  box: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
