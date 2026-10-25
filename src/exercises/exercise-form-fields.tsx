import { useTranslation } from 'react-i18next';
import { Alert, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { LOG_KINDS, type CustomExerciseForm, type KindLock, type LogKind } from './custom';
import { isUserPhoto, pickPhoto, usePictureUrls } from './photos';

const MAX_STEPS = 20;

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
                  <Icon name="camera" size={26} color="textMuted" />
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
  const { colors, radii, spacing } = useTheme();
  const field = useFieldStyle();
  return (
    <>
      {steps.map((step, index) => (
        <View key={index} style={[styles.step, { gap: spacing.sm }]}>
          <View style={[styles.number, { backgroundColor: colors.iconBackground }]}>
            <Text variant="captionStrong" color="primaryText">
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
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange([...steps, ''])}
          style={[
            styles.addStep,
            {
              borderRadius: radii.full,
              backgroundColor: colors.iconBackground,
              paddingHorizontal: spacing.md,
            },
          ]}
        >
          <Text variant="captionStrong" color="primaryText">
            {t('customExercise.addStep')}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
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
