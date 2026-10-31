import { type Dispatch, type SetStateAction, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { MAX_MESSAGE_LENGTH } from '@shared/coach/chat';
import { MAX_PHOTOS } from '@shared/photos';

import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { MealPhotoSheet } from '@/nutrition/meal-photo-sheet';
import { useTheme } from '@/theme';

import { type PhotosProblem, prepareChatPhoto } from './chat-photos';
import { PhotoTray } from './photo-tray';
import type { Draft } from './use-chat';

type ChatComposerProps = {
  /** What the user is writing, kept by the chat, which hands back a message refused. */
  draft: Draft;
  onChange: Dispatch<SetStateAction<Draft>>;
  /** Sends the draft. */
  onSend: () => void;
  /** Stops Bite's answer; set while Bite answers, which the send button becomes. */
  onStop?: () => void;
  /** Why the draft's photos cannot be sent, said above it until they change. */
  problem?: PhotosProblem;
  onProblem: (problem: PhotosProblem | undefined) => void;
};

/**
 * Where the user writes to Bite and adds photos (boards 7 and 7b), and the note under it that
 * Bite can be wrong. The + at the start of the field takes or chooses photos, up to 3, which wait
 * above the text, each with an ×; text is optional with them.
 */
export function ChatComposer({
  draft,
  onChange,
  onSend,
  onStop,
  problem,
  onProblem,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const [picking, setPicking] = useState(false);
  /** How many photos are being prepared, which wait in the tray as they are. */
  const [preparing, setPreparing] = useState(0);
  const room = MAX_PHOTOS - draft.photos.length - preparing;
  const canSend = (!!draft.text.trim() || draft.photos.length > 0) && preparing === 0;

  const add = async (uris: string[]) => {
    const wanted = uris.slice(0, room);
    onProblem(undefined);
    setPreparing((count) => count + wanted.length);
    const prepared = await Promise.allSettled(wanted.map((uri) => prepareChatPhoto(uri)));
    setPreparing((count) => count - wanted.length);
    const photos = prepared.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    onChange((current) => ({
      ...current,
      photos: [...current.photos, ...photos].slice(0, MAX_PHOTOS),
    }));
    if (photos.length < wanted.length) onProblem({ reason: 'photo_not_prepared' });
  };

  const remove = (index: number) => {
    onProblem(undefined);
    onChange((current) => ({
      ...current,
      photos: current.photos.filter((_, at) => at !== index),
    }));
  };

  const send = () => {
    if (!canSend) return;
    onProblem(undefined);
    onSend();
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {problem ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: spacing.md }}
        >
          {t(`bite.photos.problems.${problem.reason}`, { number: (problem.photo ?? 0) + 1 })}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          { gap: spacing.xs, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {draft.photos.length > 0 || preparing > 0 ? (
          <PhotoTray
            photos={draft.photos}
            preparing={preparing}
            refused={problem?.photo}
            onRemove={remove}
            onAdd={room > 0 ? () => setPicking(true) : undefined}
          />
        ) : null}
        <View style={styles.line}>
          <RoundIconButton
            icon="plus"
            color="text"
            background="surface"
            label={t('bite.photos.add')}
            onPress={() => setPicking(true)}
            size={44}
            disabled={room <= 0}
          />
          <TextInput
            accessibilityLabel={t('bite.message')}
            placeholder={t('bite.ask')}
            placeholderTextColor={colors.placeholder}
            value={draft.text}
            onChangeText={(text) => onChange((current) => ({ ...current, text }))}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            style={[
              typography.body,
              styles.input,
              { color: colors.text, paddingHorizontal: spacing.xs },
            ]}
          />
          {onStop ? (
            <RoundIconButton
              icon="stop"
              color="background"
              background="text"
              label={t('bite.stop')}
              onPress={onStop}
              size={44}
            />
          ) : (
            <RoundIconButton
              icon="arrowUp"
              color="onPrimary"
              background="primaryButton"
              label={t('bite.send')}
              onPress={send}
              size={44}
              disabled={!canSend}
            />
          )}
        </View>
      </View>
      <Text variant="caption" color="textMuted" align="center">
        {t('bite.mistakes')}
      </Text>
      {picking ? (
        <MealPhotoSheet
          title={t('bite.photos.add')}
          hint={t('bite.photos.sheetHint')}
          limit={room}
          onPick={(uris) => void add(uris)}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

/** Half a one-line field's height, so that its ends are round. */
const FIELD_RADIUS = 26;

const styles = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderRadius: FIELD_RADIUS,
    padding: 4,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: 11,
    paddingBottom: 11,
  },
});
