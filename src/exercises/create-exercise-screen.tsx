import { router, usePreventRemove } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Text } from '@/components/ui/text';
import type { Database } from '@/lib/database.types';
import { fonts, typography, useTheme } from '@/theme';

import {
  emptyForm,
  isComplete,
  LOG_KINDS,
  setCreatedExercise,
  useCreateExercise,
  type CustomExerciseForm,
  type LogKind,
} from './custom';
import { pickPhoto } from './photos';

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
const MAX_STEPS = 20;

/**
 * Creates the user's own exercise (#33): what it needs at the top, a name, how it is logged, its
 * main muscles and its level, and what may be added below. `name` fills in the name, as when
 * the picker found nothing by it.
 */
export function CreateExerciseScreen({ name = '' }: { name?: string }) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const create = useCreateExercise();
  const [form, setForm] = useState<CustomExerciseForm>(() => emptyForm(name));
  const change = (fields: Partial<CustomExerciseForm>) =>
    setForm((current) => ({ ...current, ...fields }));

  // Leaving with something typed asks first; after creating, the screen just closes.
  const changed = JSON.stringify(form) !== JSON.stringify(emptyForm(name));
  const [leave, setLeave] = useState<(() => void) | null>(null);
  usePreventRemove(changed && leave === null, ({ repeat }) =>
    Alert.alert(t('customExercise.discardTitle'), t('customExercise.discardMessage'), [
      { text: t('history.edit.keepEditing'), style: 'cancel' },
      {
        text: t('session.summary.discard'),
        style: 'destructive',
        onPress: () => setLeave(() => repeat),
      },
    ]),
  );
  useEffect(() => leave?.(), [leave]);

  const save = () =>
    create.mutateAsync(form).then(
      (exercise) => {
        setCreatedExercise(exercise);
        setLeave(() => () => router.back());
      },
      (error: unknown) => {
        console.warn('Could not create the exercise', error);
        Alert.alert(t('customExercise.saveErrorTitle'), t('customExercise.saveError'));
      },
    );

  const label = (text: string) => (
    <Text variant="caption" color="textMuted" style={styles.label}>
      {text.toLocaleUpperCase()}
    </Text>
  );

  const chip = (key: string, text: string, on: boolean, onPress: () => void, disabled = false) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderRadius: radii.full,
          borderColor: on ? colors.primaryButton : colors.border,
          backgroundColor: on ? colors.selected : colors.surface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text variant="caption" color={on ? 'primaryText' : 'text'} style={styles.bold}>
        {text}
      </Text>
    </Pressable>
  );

  // A photo is taken or chosen from a short menu, and can be removed again.
  const choosePhoto = (index: 0 | 1) => {
    const set = (uri: string | null) =>
      setForm((current) => {
        const photos: CustomExerciseForm['photos'] = [...current.photos];
        photos[index] = uri;
        return { ...current, photos };
      });
    const take = (source: 'camera' | 'library') => () =>
      void pickPhoto(source).then(
        (uri) => uri && set(uri),
        (error: unknown) => console.warn('Could not pick a photo', error),
      );
    Alert.alert(index === 0 ? t('exercise.start') : t('exercise.end'), undefined, [
      { text: t('customExercise.takePhoto'), onPress: take('camera') },
      { text: t('customExercise.choosePhoto'), onPress: take('library') },
      ...(form.photos[index]
        ? [
            {
              text: t('customExercise.removePhoto'),
              style: 'destructive' as const,
              onPress: () => set(null),
            },
          ]
        : []),
      { text: t('editor.cancel'), style: 'cancel' },
    ]);
  };

  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((value) => value !== item) : [...list, item];

  const section = { gap: spacing.sm };
  const wrap = [styles.wrap, { gap: spacing.sm }];
  const field = [
    styles.field,
    typography.body,
    {
      borderRadius: radii.md,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: spacing.md,
    },
  ];

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={
        <Text variant="bodyStrong" accessibilityRole="header" style={styles.bold}>
          {t('customExercise.title')}
        </Text>
      }
      footer={
        <Button
          label={t('customExercise.create')}
          disabled={!isComplete(form) || create.isPending}
          onPress={() => void save()}
        />
      }
    >
      <View style={section}>
        {label(t('customExercise.name'))}
        <TextInput
          accessibilityLabel={t('customExercise.name')}
          value={form.name}
          onChangeText={(text) => change({ name: text })}
          maxLength={80}
          placeholder={t('customExercise.namePlaceholder')}
          placeholderTextColor={colors.placeholder}
          style={[field, styles.bold]}
        />
      </View>

      <View style={section}>
        {label(t('customExercise.logKind'))}
        <View accessibilityRole="radiogroup" style={[styles.grid, { gap: spacing.sm }]}>
          {(Object.keys(LOG_KINDS) as LogKind[]).map((kind) => {
            const on = form.logKind === kind;
            return (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={t(`customExercise.logKinds.${kind}.title`)}
                onPress={() => change({ logKind: kind })}
                style={[
                  styles.kind,
                  {
                    borderRadius: radii.md,
                    padding: spacing.md,
                    borderWidth: on ? 2 : 1.5,
                    borderColor: on ? colors.primaryButton : colors.border,
                    backgroundColor: on ? colors.selected : colors.surface,
                  },
                ]}
              >
                <Text variant="bodyStrong" style={styles.bold}>
                  {t(`customExercise.logKinds.${kind}.title`)}
                </Text>
                <Text variant="caption" color="textMuted">
                  {t(`customExercise.logKinds.${kind}.example`)}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" color="textMuted">
          {t('customExercise.logKindFixed')}
        </Text>
      </View>

      <View style={section}>
        {label(t('customExercise.mainMuscles'))}
        <View style={wrap}>
          {MUSCLES.map((muscle) => {
            const on = form.primaryMuscles.includes(muscle);
            return chip(
              muscle,
              t(`workout.muscles.${muscle}`),
              on,
              () =>
                change({
                  primaryMuscles: toggle(form.primaryMuscles, muscle),
                  secondaryMuscles: form.secondaryMuscles.filter((other) => other !== muscle),
                }),
              !on && form.primaryMuscles.length >= MAX_MAIN_MUSCLES,
            );
          })}
        </View>
      </View>

      <View style={section}>
        {label(t('exercise.level'))}
        <SegmentedControl
          options={LEVELS.map((level) => ({ value: level, label: t(`exercise.levels.${level}`) }))}
          value={form.level}
          onChange={(level) => change({ level })}
          accessibilityLabel={t('exercise.level')}
        />
      </View>

      <View style={[styles.divider, { gap: spacing.sm, marginTop: spacing.sm }]}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        {label(t('customExercise.optional'))}
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      <View style={section}>
        {label(t('customExercise.photos'))}
        <View style={[styles.photos, { gap: spacing.sm }]}>
          {([0, 1] as const).map((index) => {
            const uri = form.photos[index];
            const name = index === 0 ? t('exercise.start') : t('exercise.end');
            return (
              <Pressable
                key={index}
                accessibilityRole="button"
                accessibilityLabel={
                  uri
                    ? t('customExercise.changePhoto', { name })
                    : t('customExercise.addPhoto', { name })
                }
                onPress={() => choosePhoto(index)}
                style={[
                  styles.photo,
                  {
                    borderRadius: radii.md,
                    borderColor: uri ? colors.border : colors.placeholder,
                    borderStyle: uri ? 'solid' : 'dashed',
                    backgroundColor: colors.surface,
                    gap: spacing.xs,
                  },
                ]}
              >
                {uri ? (
                  <>
                    <Image source={{ uri }} style={StyleSheet.absoluteFill} />
                    <View
                      style={[
                        styles.photoName,
                        { borderRadius: radii.sm, backgroundColor: colors.surface },
                      ]}
                    >
                      <Text variant="caption" color="textMuted" style={styles.bold}>
                        {name}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <Icon name="camera" size={26} color="textMuted" />
                    <Text variant="caption" color="textMuted" style={styles.bold}>
                      {name}
                    </Text>
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" color="textMuted">
          {t('customExercise.photosHint')}
        </Text>
      </View>

      <View style={section}>
        {label(t('customExercise.otherMuscles'))}
        <View style={wrap}>
          {MUSCLES.filter((muscle) => !form.primaryMuscles.includes(muscle)).map((muscle) =>
            chip(
              muscle,
              t(`workout.muscles.${muscle}`),
              form.secondaryMuscles.includes(muscle),
              () => change({ secondaryMuscles: toggle(form.secondaryMuscles, muscle) }),
            ),
          )}
        </View>
      </View>

      <View style={section}>
        {label(t('exercise.equipment'))}
        <View style={wrap}>
          {EQUIPMENT.map((item) =>
            chip(item, t(`exercise.equipmentKinds.${item}`), form.equipment === item, () =>
              change({ equipment: form.equipment === item ? null : item }),
            ),
          )}
        </View>
      </View>

      <View style={section}>
        {label(t('exercise.howTo'))}
        {form.instructions.map((step, index) => (
          <View key={index} style={[styles.step, { gap: spacing.sm }]}>
            <View style={[styles.number, { backgroundColor: colors.iconBackground }]}>
              <Text variant="caption" color="primaryText" style={styles.bold}>
                {index + 1}
              </Text>
            </View>
            <TextInput
              accessibilityLabel={t('customExercise.step', { number: index + 1 })}
              value={step}
              multiline
              maxLength={500}
              onChangeText={(text) =>
                change({
                  instructions: form.instructions.map((item, i) => (i === index ? text : item)),
                })
              }
              style={[field, styles.stepInput]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('customExercise.removeStep', { number: index + 1 })}
              onPress={() =>
                change({ instructions: form.instructions.filter((_, i) => i !== index) })
              }
              hitSlop={6}
              style={styles.remove}
            >
              <Icon name="close" size={18} color="textMuted" />
            </Pressable>
          </View>
        ))}
        {form.instructions.length < MAX_STEPS ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => change({ instructions: [...form.instructions, ''] })}
            style={[
              styles.addStep,
              {
                borderRadius: radii.full,
                backgroundColor: colors.iconBackground,
                paddingHorizontal: spacing.md,
              },
            ]}
          >
            <Text variant="caption" color="primaryText" style={styles.bold}>
              {t('customExercise.addStep')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontFamily: fonts.extraBold,
  },
  label: {
    fontFamily: fonts.extraBold,
    letterSpacing: 0.4,
  },
  field: {
    minHeight: 52,
    borderWidth: 1.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  kind: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 2,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  photos: {
    flexDirection: 'row',
  },
  photo: {
    flex: 1,
    aspectRatio: 1,
    borderWidth: 1.5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoName: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  line: {
    flex: 1,
    height: 1,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepInput: {
    flex: 1,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  remove: {
    width: 32,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addStep: {
    alignSelf: 'flex-start',
    height: 40,
    justifyContent: 'center',
  },
});
