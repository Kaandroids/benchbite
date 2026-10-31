import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { MAX_MESSAGE_LENGTH } from '@shared/coach/chat';
import { MAX_PHOTOS } from '@shared/photos';

import { PhotoSheet } from '@/components/photo-sheet';
import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { type PhotosProblem, prepareChatPhoto } from './chat-photos';
import { PhotoTray } from './photo-tray';
import type { Draft } from './use-chat';

/** A message whose photos were refused, handed back with why, once for each refusal. */
export type RefusedDraft = { draft: Draft; problem: PhotosProblem };

type ChatComposerProps = {
  /** Sends what the user wrote; the composer empties as it does. */
  onSend: (draft: Draft) => void;
  /** Stops Bite's answer; set while Bite answers, which the send button becomes. */
  onStop?: () => void;
  /**
   * The last message refused, which comes back to the composer, to change: put before what the
   * user wrote since, and why said above it until its photos change.
   */
  refused?: RefusedDraft;
};

const EMPTY_DRAFT: Draft = { text: '', photos: [] };

/**
 * A message handed back, refused, put back before what the user wrote since it was sent: its text
 * first, then its photos, all of them, though together they may be more than a message takes.
 */
function withRefused(current: Draft, refused: Draft): Draft {
  return {
    text: [refused.text, current.text].filter((text) => text.trim()).join('\n'),
    photos: [...refused.photos, ...current.photos],
  };
}

/**
 * Where the user writes to Bite and adds photos (boards 7 and 7b), and the note under it that
 * Bite can be wrong. The + at the start of the field takes or chooses photos, up to 3, which wait
 * above the text, each with an ×; text is optional with them.
 */
export function ChatComposer({ onSend, onStop, refused }: ChatComposerProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  // What the user writes stays here, so that typing renders the composer alone, not the chat.
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<PhotosProblem>();
  const [picking, setPicking] = useState(false);
  /** How many photos are being prepared, which wait in the tray as they are. */
  const [preparing, setPreparing] = useState(0);
  // A message refused comes back once, before what was written since.
  const [handedBack, setHandedBack] = useState(refused);
  if (refused !== handedBack) {
    setHandedBack(refused);
    if (refused) {
      setDraft((current) => withRefused(current, refused.draft));
      setProblem(refused.problem);
    }
  }
  const room = Math.max(0, MAX_PHOTOS - draft.photos.length - preparing);
  const tooMany = draft.photos.length > MAX_PHOTOS;
  const canSend = (!!draft.text.trim() || draft.photos.length > 0) && preparing === 0 && !tooMany;
  // More photos than a message takes, as a message handed back may bring, are said until fewer.
  const shown = problem ?? (tooMany ? { reason: 'too_many_photos' as const } : undefined);

  const add = async (uris: string[]) => {
    const wanted = uris.slice(0, room);
    setProblem(undefined);
    setPreparing((count) => count + wanted.length);
    const prepared = await Promise.allSettled(wanted.map((uri) => prepareChatPhoto(uri)));
    setPreparing((count) => count - wanted.length);
    const photos = prepared.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    // None is left out: a message handed back meanwhile may bring more than fit, which is said.
    setDraft((current) => ({ ...current, photos: [...current.photos, ...photos] }));
    if (photos.length < wanted.length) setProblem({ reason: 'photo_not_prepared' });
  };

  const remove = (index: number) => {
    setProblem(undefined);
    setDraft((current) => ({
      ...current,
      photos: current.photos.filter((_, at) => at !== index),
    }));
  };

  const send = () => {
    if (!canSend) return;
    // Emptied first, so that a message refused at once, on the device, comes back to it.
    setDraft(EMPTY_DRAFT);
    setProblem(undefined);
    onSend(draft);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {shown ? (
        <Text
          variant="caption"
          color="danger"
          accessibilityLiveRegion="polite"
          style={{ paddingHorizontal: spacing.md }}
        >
          {t(`bite.photos.problems.${shown.reason}`, { number: (shown.photo ?? 0) + 1 })}
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
            onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
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
        <PhotoSheet
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
