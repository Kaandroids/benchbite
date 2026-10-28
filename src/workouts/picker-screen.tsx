import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { ScreenTitle } from '@/components/ui/screen-title';
import { SearchField } from '@/components/ui/search-field';
import { Text } from '@/components/ui/text';
import { useExerciseCaption } from '@/exercises/caption';
import { takeCreatedExercise } from '@/exercises/custom';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import { HistoryButton } from '@/exercises/history-button';
import { InfoButton } from '@/exercises/info-button';
import {
  filterExercises,
  MUSCLE_GROUPS,
  thumbnailOf,
  useExerciseLibrary,
  type ExerciseFilter,
  type LibraryExercise,
} from '@/exercises/library';
import { useTheme } from '@/theme';

import { addExercises, useDraft } from './draft';
import { useWorkoutLimits } from './workouts';

const FILTERS: ExerciseFilter[] = [...(Object.keys(MUSCLE_GROUPS) as ExerciseFilter[]), 'cardio'];
const ROW_HEIGHT = 73;

/**
 * Searches the library and the user's own exercises, and adds the chosen ones to the workout
 * being edited. An exercise the library lacks can be created from here, and comes back chosen.
 */
export function PickerScreen() {
  const { t, i18n } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const caption = useExerciseCaption();
  const library = useExerciseLibrary();
  const limits = useWorkoutLimits();
  const draft = useDraft();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ExerciseFilter | null>(null);
  // In the order they were chosen, which is the order they are added in.
  const [chosen, setChosen] = useState<LibraryExercise[]>([]);
  const results = library.data ? filterExercises(library.data, query, filter, i18n.language) : [];
  const hasOwn = library.data?.some((exercise) => exercise.custom && !exercise.archived) ?? false;

  // How many more the workout has room for; the rest of the library waits until one is unchosen.
  const room = (limits.data?.exercises ?? 0) - (draft?.exercises.length ?? 0);
  const full = chosen.length >= room;

  // An exercise just created on its own screen is chosen on coming back, if there is room.
  useFocusEffect(
    useCallback(() => {
      const created = takeCreatedExercise();
      if (created) {
        setChosen((current) => (current.length < room ? [...current, created] : current));
      }
    }, [room]),
  );

  const openCreate = (name?: string) =>
    router.push({ pathname: '/workout/exercise/new', params: name ? { name } : {} });

  const toggle = (exercise: LibraryExercise) =>
    setChosen((current) =>
      current.some((item) => item.id === exercise.id)
        ? current.filter((item) => item.id !== exercise.id)
        : [...current, exercise],
    );

  const chip = (value: ExerciseFilter | null, label: string) => {
    const on = filter === value;
    return <Chip key={label} label={label} selected={on} onPress={() => setFilter(value)} />;
  };

  const row = ({ item }: { item: LibraryExercise }) => {
    const selected = chosen.some((exercise) => exercise.id === item.id);
    const disabled = full && !selected;
    const detail = caption(item);
    return (
      <View style={[styles.row, { gap: spacing.sm, borderTopColor: colors.border }]}>
        {/* Two buttons fit the row's height only a little apart. */}
        <View style={{ gap: spacing.xs }}>
          <InfoButton exerciseId={item.id} exerciseName={item.name} />
          <HistoryButton exerciseId={item.id} exerciseName={item.name} />
        </View>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled }}
          accessibilityLabel={item.name}
          disabled={disabled}
          onPress={() => toggle(item)}
          style={[styles.choice, { gap: spacing.md, opacity: disabled ? 0.4 : 1 }]}
        >
          <ExerciseThumbnail path={thumbnailOf(item)} size={52} name={item.name} />
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={2}>
              {item.name}
            </Text>
            <Text variant="caption" color="textMuted">
              {detail}
            </Text>
          </View>
          <View
            style={[
              styles.check,
              selected
                ? { backgroundColor: colors.primaryButton, borderColor: colors.primaryButton }
                : { borderColor: colors.border },
            ]}
          >
            {selected ? <Icon name="check" size={16} color="onPrimary" /> : null}
          </View>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { paddingHorizontal: spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          style={styles.close}
        >
          <Icon name="close" color="textMuted" />
        </Pressable>
        <View style={styles.title}>
          <ScreenTitle title={t('picker.title')} />
        </View>
        {/* Keeps the title in the middle, balanced against the cross. */}
        <View style={styles.close} />
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
        <SearchField label={t('picker.search')} value={query} onChangeText={setQuery} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {chip(null, t('picker.all'))}
          {hasOwn ? chip('mine', t('picker.filters.mine')) : null}
          {FILTERS.map((value) => chip(value, t(`picker.filters.${value}`)))}
        </ScrollView>
      </View>

      {allLoaded([library, limits]) ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={row}
          // The row that creates an exercise is as tall as an exercise's, above the first.
          getItemLayout={(_data, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * (index + 1),
            index,
          })}
          ListHeaderComponent={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('customExercise.createRow')}
              accessibilityHint={t('customExercise.createRowHint')}
              onPress={() => openCreate()}
              style={[styles.row, { gap: spacing.sm, borderTopColor: colors.border }]}
            >
              <View style={styles.buttonsRoom} />
              <View
                style={[
                  styles.createTile,
                  { borderRadius: radii.md, backgroundColor: colors.iconBackground },
                ]}
              >
                <Icon name="plus" size={24} color="primary" />
              </View>
              <View style={[styles.text, { marginLeft: spacing.xs }]}>
                <Text variant="label" color="primaryText">
                  {t('customExercise.createRow')}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t('customExercise.createRowHint')}
                </Text>
              </View>
            </Pressable>
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: spacing.xl }}
          ListEmptyComponent={
            query.trim() ? (
              <View style={[styles.none, { gap: spacing.md, marginTop: spacing.xl }]}>
                <Text variant="headline" align="center">
                  {t('customExercise.noneTitle')}
                </Text>
                <Text color="textMuted" align="center">
                  {t('customExercise.noneMessage')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openCreate(query.trim())}
                  style={[
                    styles.createNamed,
                    {
                      gap: spacing.sm,
                      borderRadius: radii.full,
                      backgroundColor: colors.iconBackground,
                      paddingHorizontal: spacing.lg,
                    },
                  ]}
                >
                  <Icon name="plus" size={18} color="primaryText" />
                  <Text variant="label" color="primaryText">
                    {t('customExercise.createNamed', { name: query.trim() })}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Text color="textMuted" align="center" style={{ marginTop: spacing.xl }}>
                {t('picker.empty')}
              </Text>
            )
          }
        />
      ) : (
        <View style={[styles.root, { padding: spacing.xl }]}>
          <LoadState queries={[library, limits]} />
        </View>
      )}

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingVertical: spacing.lg,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          gap: spacing.sm,
        }}
      >
        {limits.data !== undefined && full ? (
          <Text variant="caption" color="textMuted" align="center">
            {t('picker.limit', { max: limits.data.exercises })}
          </Text>
        ) : null}
        <Button
          label={chosen.length > 0 ? t('picker.add', { count: chosen.length }) : t('picker.title')}
          disabled={chosen.length === 0}
          onPress={() => {
            addExercises(chosen);
            router.back();
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Where an exercise's info and history buttons are.
  buttonsRoom: {
    width: 32,
  },
  createTile: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  none: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  createNamed: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  title: {
    flex: 1,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    flex: 1,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
