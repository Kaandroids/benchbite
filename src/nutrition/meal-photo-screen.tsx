import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Modal, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MAX_NOTE_LENGTH } from '@shared/meal/estimate';

import { useAiAccess, type Refusal } from '@/ai/access';
import { RefusalCard } from '@/coach/refusal-card';
import { BiteAvatar } from '@/coach/bite-avatar';
import { Button } from '@/components/ui/button';
import { useFieldStyle } from '@/components/ui/field';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useNumberFormat } from '@/i18n/units';
import { useTheme } from '@/theme';

import { AddEntryError } from './add-entry-error';
import { AmountForm } from './amount-form';
import { useLogEstimate, type EstimatedEntry } from './entries';
import { EstimateCard } from './estimate-card';
import { EstimateFailure, per100Totals, type EstimateItem } from './meal-estimate';
import { handOverLoggedEstimate } from './meal-photo-handover';
import { MealPhotoSheet } from './meal-photo-sheet';
import { totalOf, useDayEntries, type Meal } from './meals';
import { useDayTargets } from './targets';
import { useMealEstimate } from './use-meal-estimate';

type MealPhotoScreenProps = {
  meal: Meal;
  /** YYYY-MM-DD. */
  day: string;
  /** The local URIs of the photos taken or chosen. */
  photos: string[];
};

/** How the progress bar fills while Bite looks: most of the way in about ten seconds. */
const PROGRESS_MS = 6000;
const PROGRESS_TICK_MS = 250;

/** The item an estimate logs: a found food by its reference, or the model's values by its name. */
function entryOf(item: EstimateItem): EstimatedEntry {
  return item.food && !item.estimated
    ? { food: item.food.ref, grams: item.grams }
    : { name: item.searchName, grams: item.grams, per100g: per100Totals(item.per100) };
}

/**
 * Logs a meal from photos (#299, ADR 0059): Bite looks at them, then shows what it sees, each food
 * with its grams, which the user can change, or correct in a note for another estimate, before
 * the foods are added to the meal. Cancel leaves at any point without adding anything; while the
 * foods are being added, it waits.
 */
export function MealPhotoScreen({ meal, day, photos: initialPhotos }: MealPhotoScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const fieldStyle = useFieldStyle();
  const { photos, state, setItems, again, retake, cancel } = useMealEstimate(meal, initialPhotos);
  const logEstimate = useLogEstimate();
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const adding = logEstimate.isPending;
  const leave = () => {
    if (adding) return;
    cancel();
    router.back();
  };

  const items = state.kind === 'estimate' ? state.items : [];
  const add = () => {
    logEstimate
      .mutateAsync({ day, meal, entries: items.map(entryOf) })
      .then((logged) => {
        // Handed over even if the screen was left meanwhile, so that Undo is offered.
        handOverLoggedEstimate({ ...logged, meal });
        if (mounted.current) router.back();
      })
      // The mutation's error is shown above the buttons.
      .catch(() => {});
  };
  const estimateAgain = () => {
    again({
      note: note.trim(),
      previous: items.map(({ name, grams }) => ({ name, grams })),
    });
    setNote('');
  };

  const cancelButton = (style?: object) => (
    <Button
      label={t('nutrition.photo.cancel')}
      variant="secondary"
      disabled={adding}
      onPress={leave}
      style={style}
    />
  );
  const refusal = state.kind === 'failed' ? failureOf(state.error).refusal : undefined;
  const blocked = state.kind === 'failed' && failureOf(state.error).reason === 'blocked';

  let footer: ReactNode = cancelButton();
  if (state.kind === 'estimate') {
    footer = (
      <Buttons
        cancel={cancelButton(styles.cancel)}
        main={
          <Button
            label={t(`nutrition.addTo.${meal}`)}
            loading={adding}
            onPress={add}
            style={styles.main}
          />
        }
      />
    );
  } else if (state.kind === 'notFood' || (state.kind === 'failed' && !refusal)) {
    const retry = state.kind === 'failed' && !blocked;
    footer = (
      <Buttons
        cancel={cancelButton(styles.cancel)}
        main={
          <Button
            label={t(retry ? 'common.tryAgain' : 'nutrition.photo.tryAnother')}
            onPress={retry ? () => again() : () => setPicking(true)}
            style={styles.main}
          />
        }
      />
    );
  }

  return (
    <KeyboardAvoiding>
      <Screen onBack={leave} title={t(`nutrition.photo.title.${meal}`)} footer={footer}>
        <Photos photos={photos} large={state.kind === 'estimating'} />

        {state.kind === 'estimating' ? <Estimating /> : null}

        {state.kind === 'estimate' ? (
          <>
            <EstimateCard meal={meal} items={items} onOpen={setEditing} />
            <View style={{ gap: spacing.sm }}>
              <Text variant="bodyStrong" color="textMuted">
                {t('nutrition.photo.noteLabel')}
              </Text>
              <TextInput
                accessibilityLabel={t('nutrition.photo.noteLabel')}
                placeholder={t('nutrition.photo.notePlaceholder')}
                placeholderTextColor={colors.placeholder}
                value={note}
                onChangeText={setNote}
                maxLength={MAX_NOTE_LENGTH}
                returnKeyType="send"
                onSubmitEditing={() => (note.trim() ? estimateAgain() : undefined)}
                style={fieldStyle}
              />
              <Button
                label={t('nutrition.photo.again')}
                variant="ghost"
                size="small"
                disabled={note.trim().length === 0}
                onPress={estimateAgain}
                style={styles.end}
              />
            </View>
            {logEstimate.isError ? <AddEntryError error={logEstimate.error} /> : null}
          </>
        ) : null}

        {state.kind === 'notFood' ? (
          <Message
            expression="surprised"
            title={t('nutrition.photo.notFood')}
            hint={[state.note, t('nutrition.photo.notFoodHint')].filter(Boolean).join(' ')}
          />
        ) : null}

        {state.kind === 'failed' ? (
          refusal ? (
            <Refused refusal={refusal} />
          ) : (
            <Message
              expression="sad"
              title={t('nutrition.photo.failed')}
              hint={t(blocked ? 'nutrition.photo.blockedHint' : 'nutrition.photo.failedHint')}
            />
          )
        ) : null}
      </Screen>

      {editing !== null && items[editing] ? (
        <ItemAmount
          item={items[editing]}
          day={day}
          onClose={() => setEditing(null)}
          onSave={(grams) => {
            setItems(items.map((item, index) => (index === editing ? { ...item, grams } : item)));
            setEditing(null);
          }}
        />
      ) : null}
      {picking ? <MealPhotoSheet onPick={retake} onClose={() => setPicking(false)} /> : null}
    </KeyboardAvoiding>
  );
}

/**
 * Cancel and the main button side by side, each as wide as its label needs and the main one
 * taking the rest; when both do not fit, as in German, the main one goes above Cancel.
 */
function Buttons({ cancel, main }: { cancel: ReactNode; main: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.buttons, { gap: spacing.md }]}>
      {cancel}
      {main}
    </View>
  );
}

/** Any failure of an estimate as an `EstimateFailure`, one that is not as `unavailable`. */
function failureOf(error: unknown): EstimateFailure {
  return error instanceof EstimateFailure ? error : new EstimateFailure('unavailable');
}

/** The photos of the meal, large while Bite looks at them and small beside the estimate. */
function Photos({ photos, large }: { photos: string[]; large: boolean }) {
  const { t } = useTranslation();
  const { radii, spacing } = useTheme();
  const size = large ? 110 : 64;
  return (
    <View style={[styles.photos, { gap: spacing.sm }]}>
      {photos.map((uri, index) => (
        <Image
          key={uri}
          source={{ uri }}
          accessibilityLabel={t('nutrition.photo.photo', { number: index + 1 })}
          style={{ width: size, height: size, borderRadius: large ? radii.md : radii.sm }}
        />
      ))}
    </View>
  );
}

/** Bite thinking while it looks at the photos, with a bar that fills as the seconds pass. */
function Estimating() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      // Never full, as how long the answer takes is not known.
      setProgress(0.9 * (1 - Math.exp(-(Date.now() - started) / PROGRESS_MS)));
    }, PROGRESS_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={[styles.center, { gap: spacing.lg, paddingVertical: spacing.xxl }]}>
      <BiteAvatar size={88} state="thinking" />
      <Text
        variant="headline"
        align="center"
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
      >
        {t('nutrition.photo.looking')}
      </Text>
      <Text variant="body" color="textMuted" align="center" style={styles.hint}>
        {t('nutrition.photo.lookingHint')}
      </Text>
      <View style={styles.progress}>
        <ProgressBar value={progress} accessible={false} />
      </View>
    </View>
  );
}

/** Bite with a short message in the middle of the screen, such as why there is no estimate. */
function Message({
  expression,
  title,
  hint,
}: {
  expression: 'surprised' | 'sad';
  title: string;
  hint: string;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.center, { gap: spacing.md, paddingVertical: spacing.xxl }]}>
      <BiteAvatar size={88} expression={expression} />
      <Text variant="headline" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="textMuted" align="center" style={styles.hint}>
        {hint}
      </Text>
    </View>
  );
}

/** Why the user may not use Bite now, as the chat says it, with when the month resets. */
function Refused({ refusal }: { refusal: Refusal }) {
  const access = useAiAccess();
  return <RefusalCard refusal={refusal} resetsAt={access.data?.resetsAt} />;
}

/** Changes an item's grams, in the form that adds a food, over the estimate. */
function ItemAmount({
  item,
  day,
  onClose,
  onSave,
}: {
  item: EstimateItem;
  day: string;
  onClose: () => void;
  onSave: (grams: number) => void;
}) {
  const { t } = useTranslation();
  const { format } = useNumberFormat();
  const entries = useDayEntries(day);
  const targets = useDayTargets(day);
  const per100g = per100Totals(item.per100);
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      {/* On iOS, a screen in a full-screen modal gets no safe area without a provider of its own. */}
      <SafeAreaProvider>
        <AmountForm
          title={item.name}
          subtitle={t('nutrition.amount.per100g', { calories: format(per100g.calories) })}
          onBack={onClose}
          per100g={per100g}
          // An estimate is in grams.
          portions={[]}
          initial={{ grams: item.grams, portion: null }}
          eatenCalories={totalOf(entries.data ?? []).calories}
          targetCalories={targets.data?.calories ?? null}
          submitLabel={t('nutrition.photo.saveAmount')}
          submitting={false}
          onSubmit={({ grams }) => onSave(grams)}
        />
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    // The first line at the bottom: Cancel stays below when the main button wraps above it.
    flexWrap: 'wrap-reverse',
  },
  cancel: {
    flexGrow: 1,
    minWidth: 120,
  },
  main: {
    flexGrow: 3,
  },
  end: {
    alignSelf: 'flex-end',
  },
  photos: {
    flexDirection: 'row',
  },
  center: {
    alignItems: 'center',
  },
  hint: {
    maxWidth: 290,
  },
  progress: {
    width: 220,
  },
});
