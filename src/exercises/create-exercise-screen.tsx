import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet, SheetTitle } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useLeavePrompt } from '@/components/use-leave-prompt';
import type { Database } from '@/lib/database.types';
import { typography, useTheme } from '@/theme';

import {
  emptyForm,
  isComplete,
  missingFields,
  setCreatedExercise,
  useCreateExercise,
  useEditExercise,
  type CustomExerciseForm,
  type KindLock,
} from './custom';
import {
  EquipmentChoice,
  LogKindField,
  MuscleChoice,
  PhotosField,
  SheetField,
  StepsField,
} from './exercise-form-fields';

type Enums = Database['public']['Enums'];

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
 * logged and its main muscles, marked as needed, and what may be added under them. The longer
 * choices open in sheets, so that the form stays short. `name` fills in the name, as when the
 * picker found nothing by it.
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
  const [open, setOpen] = useState<'logKind' | 'mainMuscles' | 'otherMuscles' | 'equipment' | null>(
    null,
  );
  const close = () => setOpen(null);
  const muscleNames = (muscles: Enums['muscle'][]) =>
    muscles.length > 0 ? muscles.map((muscle) => t(`workout.muscles.${muscle}`)).join(', ') : null;

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

  const section = { gap: spacing.sm };
  // What Create still waits for, so that its being off is not a riddle.
  const missing = missingFields(form).map((field) => t(`customExercise.${field}`));
  const field = useFieldStyle();

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={editing ? t('customExercise.editTitle') : t('customExercise.title')}
      footer={
        <View style={section}>
          {missing.length > 0 ? (
            <Text variant="caption" color="textMuted" align="center">
              {t('customExercise.stillNeeded', { fields: missing.join(', ') })}
            </Text>
          ) : null}
          <Button
            label={editing ? t('customExercise.save') : t('customExercise.create')}
            disabled={!isComplete(form) || saving || (editing !== undefined && !changed)}
            onPress={() => void save()}
          />
        </View>
      }
    >
      <View style={section}>
        <FieldLabel text={t('customExercise.name')} required />
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

      <SheetField
        label={t('customExercise.logKind')}
        required
        value={form.logKind && t(`customExercise.logKinds.${form.logKind}.title`)}
        onPress={() => setOpen('logKind')}
      />

      <SheetField
        label={t('customExercise.mainMuscles')}
        required
        value={muscleNames(form.primaryMuscles)}
        onPress={() => setOpen('mainMuscles')}
      />

      <SheetField
        label={t('customExercise.otherMuscles')}
        value={muscleNames(form.secondaryMuscles)}
        onPress={() => setOpen('otherMuscles')}
      />

      <SheetField
        label={t('exercise.equipment')}
        value={form.equipment && t(`exercise.equipmentKinds.${form.equipment}`)}
        onPress={() => setOpen('equipment')}
      />

      <View style={section}>
        <FieldLabel text={t('exercise.level')} />
        <SegmentedControl
          options={LEVELS.map((level) => ({ value: level, label: t(`exercise.levels.${level}`) }))}
          value={form.level}
          onChange={(level) => change({ level })}
          accessibilityLabel={t('exercise.level')}
        />
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
        <FieldLabel text={t('exercise.howTo')} />
        <StepsField
          steps={form.instructions}
          onChange={(instructions) => change({ instructions })}
        />
      </View>

      {open === 'logKind' ? (
        <Sheet onClose={close}>
          <SheetTitle>{t('customExercise.logKind')}</SheetTitle>
          <LogKindField
            value={form.logKind}
            lock={kindLock}
            onChange={(logKind) => {
              change({ logKind });
              close();
            }}
          />
        </Sheet>
      ) : null}
      {open === 'mainMuscles' ? (
        <Sheet onClose={close}>
          <SheetTitle>{t('customExercise.mainMuscles')}</SheetTitle>
          <MuscleChoice
            selected={form.primaryMuscles}
            full={form.primaryMuscles.length >= MAX_MAIN_MUSCLES}
            onToggle={(muscle) =>
              change({
                primaryMuscles: toggle(form.primaryMuscles, muscle),
                secondaryMuscles: form.secondaryMuscles.filter((other) => other !== muscle),
              })
            }
          />
          <Button label={t('common.done')} onPress={close} />
        </Sheet>
      ) : null}
      {open === 'otherMuscles' ? (
        <Sheet onClose={close}>
          <SheetTitle>{t('customExercise.otherMuscles')}</SheetTitle>
          <MuscleChoice
            selected={form.secondaryMuscles}
            hidden={form.primaryMuscles}
            onToggle={(muscle) =>
              change({ secondaryMuscles: toggle(form.secondaryMuscles, muscle) })
            }
          />
          <Button label={t('common.done')} onPress={close} />
        </Sheet>
      ) : null}
      {open === 'equipment' ? (
        <Sheet onClose={close}>
          <SheetTitle>{t('exercise.equipment')}</SheetTitle>
          <EquipmentChoice
            value={form.equipment}
            onChange={(equipment) => {
              change({ equipment });
              close();
            }}
          />
        </Sheet>
      ) : null}
    </Screen>
  );
}
