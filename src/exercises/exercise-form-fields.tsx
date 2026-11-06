import { useTranslation } from 'react-i18next';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Chip } from '@/components/ui/chip';
import { DashedButton } from '@/components/ui/dashed-button';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import type { Database } from '@/lib/database.types';
import { useTheme } from '@/theme';

import { LOG_KINDS, type CustomExerciseForm, type KindLock, type LogKind } from './custom';
import { MUSCLE_GROUPS } from './library';
import { isUserPhoto, pickPhoto, usePictureUrls } from './photos';

type Muscle = Database['public']['Enums']['muscle'];
type Equipment = Database['public']['Enums']['equipment'];

const MAX_STEPS = 20;
/** How much of the screen the muscles may take in their sheet. */
const MUSCLES_MAX_HEIGHT = 0.6;
const EQUIPMENT: Equipment[] = [
  'barbell',
  'dumbbell',
  'body only',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'other',
];

/** A labelled choice kept in a sheet: what is chosen so far, or a prompt, and a way to open it. */
export function SheetField({
  label,
  required = false,
  value,
  onPress,
}: {
  label: string;
  required?: boolean;
  /** What is chosen, or null while nothing is. */
  value: string | null;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const shown = value ?? t('customExercise.choose');
  return (
    <View style={{ gap: spacing.sm }}>
      <FieldLabel text={label} required={required} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown}`}
        onPress={onPress}
        style={[
          styles.sheetField,
          {
            gap: spacing.sm,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text
          variant="label"
          color={value ? 'text' : 'textMuted'}
          numberOfLines={1}
          style={styles.sheetFieldValue}
        >
          {shown}
        </Text>
        <Icon name="forward" size={16} color="textMuted" />
      </Pressable>
    </View>
  );
}

/** The muscles in the library's groups, scrolling when they do not fit in their sheet. */
export function MuscleChoice({
  selected,
  hidden = [],
  full = false,
  onToggle,
}: {
  selected: Muscle[];
  /** Muscles not on offer, as a main muscle is not also another one. */
  hidden?: Muscle[];
  /** No more can be chosen. */
  full?: boolean;
  onToggle: (muscle: Muscle) => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { height } = useWindowDimensions();
  return (
    <ScrollView
      style={{ maxHeight: height * MUSCLES_MAX_HEIGHT }}
      contentContainerStyle={{ gap: spacing.md }}
    >
      {(Object.keys(MUSCLE_GROUPS) as (keyof typeof MUSCLE_GROUPS)[]).map((group) => {
        const muscles: Muscle[] = MUSCLE_GROUPS[group];
        const shown = muscles.filter((muscle) => !hidden.includes(muscle));
        return shown.length > 0 ? (
          <View key={group} style={{ gap: spacing.sm }}>
            <FieldLabel text={t(`picker.filters.${group}`)} />
            <View style={[styles.wrap, { gap: spacing.sm }]}>
              {shown.map((muscle) => {
                const on = selected.includes(muscle);
                return (
                  <Chip
                    key={muscle}
                    label={t(`workout.muscles.${muscle}`)}
                    selected={on}
                    disabled={full && !on}
                    onPress={() => onToggle(muscle)}
                  />
                );
              })}
            </View>
          </View>
        ) : null;
      })}
    </ScrollView>
  );
}

/** The equipment to choose from; choosing what is chosen takes it away. */
export function EquipmentChoice({
  value,
  onChange,
}: {
  value: Equipment | null;
  onChange: (equipment: Equipment | null) => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.wrap, { gap: spacing.sm }]}>
      {EQUIPMENT.map((item) => (
        <Chip
          key={item}
          label={t(`exercise.equipmentKinds.${item}`)}
          selected={value === item}
          onPress={() => onChange(value === item ? null : item)}
        />
      ))}
    </View>
  );
}

/** How the exercise is logged, as cards, with why it cannot change when it cannot. */
export function LogKindField({
  value,
  lock,
  onChange,
}: {
  value: LogKind | null;
  lock: KindLock;
  onChange: (kind: LogKind) => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const locked = lock !== null;
  return (
    <>
      <View accessibilityRole="radiogroup" style={[styles.grid, { gap: spacing.sm }]}>
        {(Object.keys(LOG_KINDS) as LogKind[]).map((kind) => {
          const on = value === kind;
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityState={{ checked: on, disabled: locked }}
              accessibilityLabel={t(`customExercise.logKinds.${kind}.title`)}
              disabled={locked}
              onPress={() => onChange(kind)}
              style={[
                styles.kind,
                {
                  borderRadius: radii.md,
                  padding: spacing.md,
                  borderWidth: on ? 2 : 1.5,
                  borderColor: on ? colors.primaryButton : colors.border,
                  backgroundColor: on ? colors.selected : colors.surface,
                  opacity: locked && !on ? 0.4 : 1,
                },
              ]}
            >
              <Text variant="label">{t(`customExercise.logKinds.${kind}.title`)}</Text>
              <Text variant="caption" color="textMuted">
                {t(`customExercise.logKinds.${kind}.example`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="caption" color="textMuted">
        {lock === 'logged'
          ? t('customExercise.logKindLogged')
          : lock === 'inWorkout'
            ? t('customExercise.logKindInWorkout')
            : t('customExercise.logKindFixed')}
      </Text>
    </>
  );
}

/**
 * The start and end photos, each taken or chosen from a short menu and removable again. Photos the
 * exercise already has are shown through their signed URLs.
 */
export function PhotosField({
  photos,
  onChange,
}: {
  photos: CustomExerciseForm['photos'];
  onChange: (index: 0 | 1, uri: string | null) => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const urls = usePictureUrls(
    photos.filter((photo): photo is string => !!photo && isUserPhoto(photo)),
  );

  const choose = (index: 0 | 1) => {
    const take = (source: 'camera' | 'library') => () =>
      void pickPhoto(source).then(
        (uri) => uri && onChange(index, uri),
        (error: unknown) => console.warn('Could not pick a photo', error),
      );
    Alert.alert(index === 0 ? t('exercise.start') : t('exercise.end'), undefined, [
      { text: t('customExercise.takePhoto'), onPress: take('camera') },
      { text: t('customExercise.choosePhoto'), onPress: take('library') },
      ...(photos[index]
        ? [
            {
              text: t('customExercise.removePhoto'),
              style: 'destructive' as const,
              onPress: () => onChange(index, null),
            },
          ]
        : []),
      { text: t('editor.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <>
      <View style={[styles.photos, { gap: spacing.sm }]}>
        {([0, 1] as const).map((index) => {
          const photo = photos[index];
          const uri = photo && isUserPhoto(photo) ? urls[photo] : photo;
          const name = index === 0 ? t('exercise.start') : t('exercise.end');
          return (
            <Pressable
              key={index}
              accessibilityRole="button"
              accessibilityLabel={
                photo
                  ? t('customExercise.changePhoto', { name })
                  : t('customExercise.addPhoto', { name })
              }
              onPress={() => choose(index)}
              style={[
                styles.photo,
                {
                  borderRadius: radii.md,
                  borderColor: photo ? colors.border : colors.placeholder,
                  borderStyle: photo ? 'solid' : 'dashed',
                  backgroundColor: colors.surface,
                  gap: spacing.xs,
                },
              ]}
            >
              {photo ? (
                <>
                  {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : null}
                  <View
                    style={[
                      styles.photoName,
                      { borderRadius: radii.sm, backgroundColor: colors.surface },
                    ]}
                  >
                    <Text variant="captionStrong" color="textMuted">
                      {name}
                    </Text>
                  </View>
                </>
              ) : (
                <>
                  <Icon name="camera" size={22} color="textMuted" />
                  <Text variant="captionStrong" color="textMuted">
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
    </>
  );
}

/** The numbered steps of how to do the exercise, each removable, with a button to add one. */
export function StepsField({
  steps,
  onChange,
}: {
  steps: string[];
  onChange: (steps: string[]) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const field = useFieldStyle();
  return (
    <>
      {steps.map((step, index) => (
        <View key={index} style={[styles.step, { gap: spacing.sm }]}>
          <View style={[styles.number, { backgroundColor: colors.track }]}>
            <Text variant="captionStrong" color="textMuted">
              {index + 1}
            </Text>
          </View>
          <TextInput
            accessibilityLabel={t('customExercise.step', { number: index + 1 })}
            value={step}
            multiline
            maxLength={500}
            onChangeText={(text) => onChange(steps.map((item, i) => (i === index ? text : item)))}
            style={[field, styles.stepInput]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('customExercise.removeStep', { number: index + 1 })}
            onPress={() => onChange(steps.filter((_, i) => i !== index))}
            hitSlop={6}
            style={styles.remove}
          >
            <Icon name="close" size={18} color="textMuted" />
          </Pressable>
        </View>
      ))}
      {steps.length < MAX_STEPS ? (
        <DashedButton
          icon="plus"
          label={t('customExercise.addStep')}
          tone="muted"
          onPress={() => onChange([...steps, ''])}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  sheetField: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  sheetFieldValue: {
    flex: 1,
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
  photos: {
    flexDirection: 'row',
  },
  photo: {
    flex: 1,
    height: 104,
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
});
