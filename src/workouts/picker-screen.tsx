import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { ScreenTitle } from '@/components/ui/screen-title';
import { SearchField } from '@/components/ui/search-field';
import { closeThen, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TopBarButton } from '@/components/ui/top-bar-button';
import { useExerciseCaption } from '@/exercises/caption';
import { takeCreatedExercise } from '@/exercises/custom';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
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
const ROW_HEIGHT = 84;
const THUMBNAIL = 60;

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
  const [optionsOf, setOptionsOf] = useState<LibraryExercise | null>(null);
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
      <View style={styles.row}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled }}
          accessibilityLabel={item.name}
          disabled={disabled}
          onPress={() => toggle(item)}
          style={[
            styles.choice,
            {
              gap: spacing.md,
              padding: spacing.sm,
              borderRadius: radii.lg,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.selected : colors.surface,
              opacity: disabled ? 0.4 : 1,
            },
          ]}
        >
          <View>
            <ExerciseThumbnail path={thumbnailOf(item)} size={THUMBNAIL} name={item.name} />
            {selected ? (
              <View
                style={[
                  styles.check,
                  { backgroundColor: colors.primaryButton, borderColor: colors.selected },
                ]}
              >
                <Icon name="check" size={12} color="onPrimary" />
              </View>
            ) : null}
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
              {item.name}
            </Text>
            <Text variant="caption" color="textMuted" numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </Pressable>
        {/* Beside the choice rather than in it, so that screen readers reach it on its own. */}
        <View style={styles.more}>
          <TopBarButton
            icon="more"
            label={t('picker.more', { name: item.name })}
            onPress={() => setOptionsOf(item)}
          />
        </View>
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
        {/* Centred, as the button at the end reaches further in than the cross at the start. */}
        <View style={[styles.title, { paddingLeft: spacing.sm }]}>
          <ScreenTitle title={t('picker.title')} />
        </View>
        {/* In line with the search field below, whose side is wider than the bar's. */}
        <View style={{ marginRight: spacing.xl - spacing.md }}>
          <RoundIconButton
            icon="plus"
            color="onPrimary"
            background="primaryButton"
            label={t('customExercise.createRow')}
            size={40}
            onPress={() => openCreate()}
          />
        </View>
      </View>

      <View
        style={{
          paddingHorizontal: spacing.xl,
          paddingTop: spacing.md,
          gap: spacing.md,
          paddingBottom: spacing.md,
        }}
      >
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
          getItemLayout={(_data, index) => ({
            length: ROW_HEIGHT,
            offset: ROW_HEIGHT * index,
            index,
          })}
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
      {optionsOf ? (
        <ExerciseOptions exercise={optionsOf} onClose={() => setOptionsOf(null)} />
      ) : null}
    </SafeAreaView>
  );
}

/** What can be read about an exercise of the list, without choosing it. */
function ExerciseOptions({
  exercise,
  onClose,
}: {
  exercise: LibraryExercise;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const params = { id: exercise.id };
  const options = [
    {
      key: 'details',
      icon: 'info',
      color: 'info',
      background: 'infoBackground',
      label: t('picker.details'),
      open: () => router.push({ pathname: '/workout/exercise/[id]', params }),
    },
    {
      key: 'progress',
      icon: 'trend',
      color: 'dinner',
      background: 'dinnerBackground',
      label: t('picker.progress'),
      open: () => router.push({ pathname: '/workout/exercise/history', params }),
    },
  ] as const;
  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {exercise.name}
      </Text>
      <Card list>
        {options.map(({ key, icon, color, background, label, open }, index) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            onPress={closeThen(onClose, open)}
            style={[styles.option, { gap: spacing.md }, listDivider(index === 0, colors.border)]}
          >
            <IconTile name={icon} size={36} color={color} background={background} />
            <Text variant="label" style={styles.text}>
              {label}
            </Text>
            <Icon name="forward" size={16} color="textMuted" />
          </Pressable>
        ))}
      </Card>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
  },
  more: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  // The card, with the gap to the next one under it.
  row: {
    height: ROW_HEIGHT,
    paddingBottom: 8,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  text: {
    flex: 1,
  },
  // Clear of the button in the card's corner.
  name: {
    paddingRight: 28,
  },
  check: {
    position: 'absolute',
    right: -6,
    top: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
