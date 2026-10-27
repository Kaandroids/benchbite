import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useLeavePrompt } from '@/components/use-leave-prompt';
import type { Database } from '@/lib/database.types';
import { typography, useTheme } from '@/theme';

import {
  emptyForm,
  isComplete,
  setCreatedExercise,
  useCreateExercise,
  useEditExercise,
  type CustomExerciseForm,
  type KindLock,
} from './custom';
import { LogKindField, PhotosField, StepsField } from './exercise-form-fields';

type Enums = Database['public']['Enums'];

const MUSCLES: Enums['muscle'][] = [
  'chest',
  'lats',
  'middle back',
  'lower back',
  'traps',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abdominals',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'abductors',
  'adductors',
  'neck',
];
const EQUIPMENT: Enums['equipment'][] = [
  'barbell',
  'dumbbell',
  'body only',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'other',
];
const LEVELS: Enums['exercise_level'][] = ['beginner', 'intermediate', 'expert'];
const MAX_MAIN_MUSCLES = 5;

type Editing = {
  id: string;
  form: CustomExerciseForm;
  /** Why what it records cannot change, if it cannot. */
  kindLock: KindLock;
};

/**
 * Creates the user's own exercise (#33), or edits it: what it needs at the top, a name, how it is
 * logged, its main muscles and its level, and what may be added below. `name` fills in the name,
 * as when the picker found nothing by it.
 */
export function CreateExerciseScreen({ name = '', editing }: { name?: string; editing?: Editing }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const create = useCreateExercise();
  const edit = useEditExercise(editing?.id ?? '');
  const initial = editing?.form ?? emptyForm(name);
  const [form, setForm] = useState<CustomExerciseForm>(initial);
  const saving = create.isPending || edit.isPending;
  const change = (fields: Partial<CustomExerciseForm>) =>
    setForm((current) => ({ ...current, ...fields }));

  // Leaving with something typed asks first; after creating, the screen just closes.
  const changed = JSON.stringify(form) !== JSON.stringify(initial);
  const leaveWithoutAsking = useLeavePrompt(
    changed,
    t('customExercise.discardTitle'),
    t('customExercise.discardMessage'),
  );

  const failed = (error: unknown) => {
    console.warn('Could not save the exercise', error);
    Alert.alert(t('customExercise.saveErrorTitle'), t('customExercise.saveError'));
  };
  const save = () =>
    editing
      ? edit
          .mutateAsync({
            form,
            before: editing.form.photos.filter((photo): photo is string => photo !== null),
          })
          .then(() => leaveWithoutAsking(() => router.back()), failed)
      : create.mutateAsync(form).then((exercise) => {
          setCreatedExercise(exercise);
          leaveWithoutAsking(() => router.back());
        }, failed);
  const kindLock = editing?.kindLock ?? null;

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

  const section = { gap: spacing.sm };
  const wrap = [styles.wrap, { gap: spacing.sm }];
  const field = useFieldStyle();

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={editing ? t('customExercise.editTitle') : t('customExercise.title')}
      footer={
        <Button
          label={editing ? t('customExercise.save') : t('customExercise.create')}
          disabled={!isComplete(form) || saving || (editing !== undefined && !changed)}
          onPress={() => void save()}
        />
      }
    >
      <View style={section}>
        <FieldLabel text={t('customExercise.name')} />
        <TextInput
          accessibilityLabel={t('customExercise.name')}
          value={form.name}
          onChangeText={(text) => change({ name: text })}
          maxLength={80}
          placeholder={t('customExercise.namePlaceholder')}
          placeholderTextColor={colors.placeholder}
          style={[field, { fontFamily: typography.label.fontFamily }]}
        />
      </View>

      <View style={section}>
        <FieldLabel text={t('customExercise.logKind')} />
        <LogKindField
          value={form.logKind}
          lock={kindLock}
          onChange={(logKind) => change({ logKind })}
        />
      </View>

      <View style={section}>
        <FieldLabel text={t('customExercise.mainMuscles')} />
        <View style={wrap}>
          {MUSCLES.map((muscle) => {
            const on = form.primaryMuscles.includes(muscle);
            return (
              <Chip
                key={muscle}
                label={t(`workout.muscles.${muscle}`)}
                selected={on}
                disabled={!on && form.primaryMuscles.length >= MAX_MAIN_MUSCLES}
                onPress={() =>
                  change({
                    primaryMuscles: toggle(form.primaryMuscles, muscle),
                    secondaryMuscles: form.secondaryMuscles.filter((other) => other !== muscle),
                  })
                }
              />
            );
          })}
        </View>
      </View>

      <View style={section}>
        <FieldLabel text={t('exercise.level')} />
        <SegmentedControl
          options={LEVELS.map((level) => ({ value: level, label: t(`exercise.levels.${level}`) }))}
          value={form.level}
          onChange={(level) => change({ level })}
          accessibilityLabel={t('exercise.level')}
        />
      </View>

      <View style={[styles.divider, { gap: spacing.sm, marginTop: spacing.sm }]}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <FieldLabel text={t('customExercise.optional')} />
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <View style={section}>
        <FieldLabel text={t('customExercise.photos')} />
        <PhotosField
          photos={form.photos}
          onChange={(index, uri) =>
            setForm((current) => {
              const photos: CustomExerciseForm['photos'] = [...current.photos];
              photos[index] = uri;
              return { ...current, photos };
            })
          }
        />
      </View>

      <View style={section}>
        <FieldLabel text={t('customExercise.otherMuscles')} />
        <View style={wrap}>
          {MUSCLES.filter((muscle) => !form.primaryMuscles.includes(muscle)).map((muscle) => (
            <Chip
              key={muscle}
              label={t(`workout.muscles.${muscle}`)}
              selected={form.secondaryMuscles.includes(muscle)}
              onPress={() => change({ secondaryMuscles: toggle(form.secondaryMuscles, muscle) })}
            />
          ))}
        </View>
      </View>

      <View style={section}>
        <FieldLabel text={t('exercise.equipment')} />
        <View style={wrap}>
          {EQUIPMENT.map((item) => (
            <Chip
              key={item}
              label={t(`exercise.equipmentKinds.${item}`)}
              selected={form.equipment === item}
              onPress={() => change({ equipment: form.equipment === item ? null : item })}
            />
          ))}
        </View>
      </View>

      <View style={section}>
        <FieldLabel text={t('exercise.howTo')} />
        <StepsField
          steps={form.instructions}
          onChange={(instructions) => change({ instructions })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: 1,
  },
});
