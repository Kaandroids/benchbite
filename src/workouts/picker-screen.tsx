import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { allLoaded, LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { InfoButton } from '@/components/ui/info-button';
import { Text } from '@/components/ui/text';
import { useExerciseCaption } from '@/exercises/caption';
import { ExerciseThumbnail } from '@/exercises/exercise-thumbnail';
import {
  filterExercises,
  MUSCLE_GROUPS,
  useExerciseLibrary,
  type ExerciseFilter,
  type LibraryExercise,
} from '@/exercises/library';
import { fonts, typography, useTheme } from '@/theme';

import { addExercises, useDraft } from './draft';
import { useWorkoutLimits } from './workouts';

const FILTERS: ExerciseFilter[] = [...(Object.keys(MUSCLE_GROUPS) as ExerciseFilter[]), 'cardio'];
const ROW_HEIGHT = 73;

/** Searches the library and adds the chosen exercises to the workout being edited. */
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

  // How many more the workout has room for; the rest of the library waits until one is unchosen.
  const room = (limits.data?.exercises ?? 0) - (draft?.exercises.length ?? 0);
  const full = chosen.length >= room;

  const toggle = (exercise: LibraryExercise) =>
    setChosen((current) =>
      current.some((item) => item.id === exercise.id)
        ? current.filter((item) => item.id !== exercise.id)
        : [...current, exercise],
    );

  const chip = (value: ExerciseFilter | null, label: string) => {
    const on = filter === value;
    return (
      <Pressable
        key={label}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={() => setFilter(value)}
        style={[
          styles.chip,
          {
            borderRadius: radii.full,
            backgroundColor: on ? colors.primaryButton : colors.surface,
            borderColor: on ? colors.primaryButton : colors.border,
          },
        ]}
      >
        <Text variant="caption" color={on ? 'onPrimary' : 'text'} style={styles.bold}>
          {label}
        </Text>
      </Pressable>
    );
  };

  const row = ({ item }: { item: LibraryExercise }) => {
    const selected = chosen.some((exercise) => exercise.id === item.id);
    const disabled = full && !selected;
    const detail = caption(item);
    return (
      <View style={[styles.row, { gap: spacing.sm, borderTopColor: colors.border }]}>
        <InfoButton exerciseId={item.id} exerciseName={item.name} />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled }}
          accessibilityLabel={item.name}
          disabled={disabled}
          onPress={() => toggle(item)}
          style={[styles.choice, { gap: spacing.md, opacity: disabled ? 0.4 : 1 }]}
        >
          <ExerciseThumbnail path={item.imagePaths[0]} size={52} />
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
        <Text variant="bodyStrong" accessibilityRole="header" style={styles.bold}>
          {t('picker.title')}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
        <View
          style={[
            styles.search,
            {
              gap: spacing.sm,
              borderRadius: radii.md,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Icon name="search" size={20} color="textMuted" />
          <TextInput
            accessibilityLabel={t('picker.search')}
            placeholder={t('picker.search')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={[styles.input, typography.body, { color: colors.text }]}
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm }}
        >
          {chip(null, t('picker.all'))}
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
            <Text color="textMuted" align="center" style={{ marginTop: spacing.xl }}>
              {t('picker.empty')}
            </Text>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bold: {
    fontFamily: fonts.extraBold,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1.5,
  },
  input: {
    flex: 1,
    height: '100%',
  },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
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
