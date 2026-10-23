import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { allLoaded, LoadState } from '@/components/load-state';
import { Icon, type IconName } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { useExerciseLibrary } from '@/exercises/library';
import { useDateFormat } from '@/i18n/dates';
import { useNumberFormat } from '@/i18n/units';
import { describeSet, setKindOf } from '@/sessions/fields';
import { fonts, useTheme, type ColorTokens } from '@/theme';
import { minutesAndSeconds, useWorkoutName } from '@/workouts/format';

import {
  durationMinutes,
  useDeleteLog,
  useLoggedSets,
  useLogSummaries,
  type LoggedSet,
} from './history';

type Stat = {
  icon: IconName;
  color: keyof ColorTokens;
  tile: keyof ColorTokens;
  value: string;
  label: string;
};

/** One finished workout: when, how long and how hard, and every set that was done. */
export function LogScreen({ id }: { id: number }) {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const logs = useLogSummaries();
  const sets = useLoggedSets(id);
  const library = useExerciseLibrary();
  const remove = useDeleteLog();
  const workoutName = useWorkoutName();
  const formatDate = useDateFormat('full');
  const { format } = useNumberFormat();
  const log = logs.data?.find((item) => item.id === id);

  if (!allLoaded([logs, sets])) {
    return (
      <Screen onBack={() => router.back()}>
        <LoadState queries={[logs, sets]} />
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

  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: 'short' });
  const seconds = Math.round((log.finishedAt.getTime() - log.startedAt.getTime()) / 1000);
  const stats: Stat[] = [
    {
      icon: 'timer',
      color: 'primaryText',
      tile: 'selected',
      value:
        seconds < 3600
          ? minutesAndSeconds(seconds)
          : `${Math.floor(durationMinutes(log) / 60)}:${String(durationMinutes(log) % 60).padStart(2, '0')} h`,
      label: t('history.stats.time'),
    },
    {
      icon: 'dumbbell',
      color: 'info',
      tile: 'infoBackground',
      value: String(log.sets),
      label: t('history.stats.sets'),
    },
    {
      icon: 'bolt',
      color: 'fat',
      tile: 'track',
      value: `${format(Math.round(log.kilograms))} kg`,
      label: t('history.stats.lifted'),
    },
    ...(log.estimatedKcal !== null
      ? [
          {
            icon: 'flame' as const,
            color: 'primary' as const,
            tile: 'iconBackground' as const,
            value: `~${format(log.estimatedKcal)}`,
            label: t('history.stats.kcal'),
          },
        ]
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
            (error: unknown) => console.warn('Could not delete the workout log', error),
          ),
      },
    ]);

  return (
    <Screen onBack={() => router.back()}>
      <View style={{ gap: 2 }}>
        <Text variant="title" accessibilityRole="header">
          {workoutName(log)}
        </Text>
        <Text color="textMuted">
          {`${formatDate(log.startedAt)} · ${time.format(log.startedAt)}–${time.format(log.finishedAt)}`}
        </Text>
      </View>

      <View style={[styles.stats, { gap: spacing.sm }]}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            style={[
              styles.stat,
              {
                gap: spacing.sm,
                padding: spacing.md,
                borderRadius: radii.md,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View
              style={[styles.tile, { borderRadius: radii.md, backgroundColor: colors[stat.tile] }]}
            >
              <Icon name={stat.icon} size={18} color={stat.color} />
            </View>
            <View>
              <Text variant="headline" style={styles.tabular}>
                {stat.value}
              </Text>
              <Text variant="caption" color="textMuted" style={styles.semibold}>
                {stat.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {exercises.map((exercise, index) => {
        const info = library.data?.find((item) => item.id === exercise.exerciseId);
        const kind = setKindOf(info?.metrics, { reps: { min: 1, max: 1 } });
        return (
          <View
            key={index}
            style={[
              styles.exercise,
              {
                gap: spacing.xs,
                padding: spacing.lg,
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <View style={[styles.row, { gap: spacing.md, marginBottom: spacing.xs }]}>
              <ExerciseThumbnail path={info?.imagePaths[0]} size={40} />
              <Text variant="bodyStrong" style={[styles.bold, styles.flex]}>
                {info?.name ?? ''}
              </Text>
            </View>
            {exercise.sets.map((set, setIndex) => (
              <View
                key={setIndex}
                style={[styles.row, { gap: spacing.md, paddingLeft: spacing.xs }]}
              >
                <Text variant="caption" color="textMuted" style={[styles.bold, styles.number]}>
                  {setIndex + 1}
                </Text>
                <Text variant="bodyStrong">{describeSet(set, kind)}</Text>
              </View>
            ))}
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
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  tile: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercise: {
    borderWidth: 1,
  },
  number: {
    width: 20,
  },
  delete: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
