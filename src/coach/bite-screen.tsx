import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAiAccess } from '@/ai/access';
import { LoadState } from '@/components/load-state';
import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { TopBarButton } from '@/components/ui/top-bar-button';
import { useTheme } from '@/theme';

import { ChatComposer, type RefusedDraft } from './chat-composer';
import { useMediaUrls } from './chat-photos';
import { type CardStates, ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';
import { mealCardIds, useMealCardStates } from './meal-cards';
import { askedNoteIds, useAskedNoteStates } from './notes';
import { proposalIds, useProposalStates } from './proposals';
import { RefusalCard } from './refusal-card';
import { firstMedia, useThreadMessages, useThreadText } from './threads';
import {
  type BiteParams,
  continueChat,
  openChats,
  openNotebook,
  useOpenedChat,
} from './bite-route';
import type { ContinueWith } from './continue-card';
import { useChat } from './use-chat';
import { useFollowEnd } from './use-follow-end';
import { useVoicePlayback } from './use-voice-playback';

/**
 * The chat with Bite (#294, ADR 0052): the one `thread` names, opened from the chats (#295), or a
 * new one. Opened from the tab bar, it goes on in the last chat while that is recent, and offers
 * it to continue otherwise (ADR 0055).
 */
export function BiteScreen() {
  const opened = useOpenedChat(useLocalSearchParams<BiteParams>());
  const { fromChats, fromNotebook } = opened;
  const { threadId, key } = opened;
  const saved = useThreadMessages(threadId);
  const threadText = useThreadText();
  // A saved chat opens on its messages as they are now, never on ones kept from before.
  if (opened.waiting || (threadId !== undefined && !saved.isFetchedAfterMount)) {
    return (
      <Screen onBack={() => router.back()} closes={!fromChats && !fromNotebook}>
        <LoadState queries={[saved]} />
      </Screen>
    );
  }
  // A thread of its own for each chat opened, so that one's messages never go on in another; a
  // thread that is gone, as one deleted from the chats, gives way to a new chat.
  return saved.data ? (
    <Chat
      key={key}
      fromChats={fromChats}
      fromNotebook={fromNotebook}
      title={
        threadText.title({
          title: saved.data.title,
          ...firstMedia(saved.data.messages),
        }) ?? undefined
      }
      start={{ threadId: threadId!, messages: saved.data.messages }}
    />
  ) : (
    <Chat
      key={threadId === undefined ? key : `gone-${threadId}`}
      fromChats={fromChats}
      fromNotebook={fromNotebook}
      continueWith={
        opened.offer && {
          thread: opened.offer,
          onContinue: continueChat,
          onAllChats: () => openChats(),
        }
      }
    />
  );
}

type ChatProps = {
  /** Whether the chat was opened over the chats, which it goes back to. */
  fromChats: boolean;
  /**
   * Whether the chat was opened over the notebook, from a note, which it goes back to; it then
   * offers no way to the notebook, so that chats and notebooks do not pile up.
   */
  fromNotebook: boolean;
  /** The name of a saved thread the chat goes on in. */
  title?: string;
  start?: Parameters<typeof useChat>[0];
  /** The last chat, no longer recent, which a new chat offers to continue. */
  continueWith?: ContinueWith;
};

function Chat({ fromChats, fromNotebook, title, start, continueWith }: ChatProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  // A message whose photos were refused comes back to the composer, to change. The composer
  // keeps what the user writes, so that typing never renders the chat.
  const [refused, setRefused] = useState<RefusedDraft>();
  // While a voice message records, the chat dims behind the composer, and stops playing (board 6).
  const [recording, setRecording] = useState(false);
  const playback = useVoicePlayback();
  const { pause } = playback;
  const onRecording = useCallback(
    (now: boolean) => {
      setRecording(now);
      if (now) pause();
    },
    [pause],
  );
  const chat = useChat(start, (draft, problem) => setRefused({ draft, problem }));
  // Where the cards in the chat stand, saved and new, loaded here once for all of them.
  const proposals = useProposalStates(proposalIds(chat.messages));
  const mealCards = useMealCardStates(mealCardIds(chat.messages));
  const notes = useAskedNoteStates(askedNoteIds(chat.messages));
  const states = { proposals, mealCards, notes };
  const cards: CardStates = {
    proposals: proposals.data,
    mealCards: mealCards.data,
    notes: notes.data,
    loading: {
      proposals: proposals.isFetching,
      mealCards: mealCards.isFetching,
      notes: notes.isFetching,
    },
    failed: { notes: notes.isError },
  };
  // A saved chat's cards show where they stand from the start, so it waits for the states of the
  // cards it opened with. Cards that come later wait on their own, so the messages never go:
  // a card being edited keeps what the user changed.
  const [openedWith] = useState(() => ({
    proposals: proposalIds(start?.messages ?? []).length > 0,
    mealCards: mealCardIds(start?.messages ?? []).length > 0,
    notes: askedNoteIds(start?.messages ?? []).length > 0,
  }));
  const opening = (Object.keys(states) as (keyof typeof states)[])
    .filter((kind) => openedWith[kind])
    .map((kind) => states[kind]);
  // The photos and voice messages the chat kept, read back once for all of them when it opens.
  // Only those it opened with: its messages are read again after each one sent, whose photos and
  // voice show from the device, and a new list would ask for every address again.
  const [keptMedia] = useState(() =>
    (start?.messages ?? []).flatMap((message) => [
      ...(message.photos ?? []).flatMap((photo) => (photo.path ? [photo.path] : [])),
      ...(message.voice?.path ? [message.voice.path] : []),
    ]),
  );
  const mediaUrls = useMediaUrls(start?.threadId, keptMedia);
  const access = useAiAccess();
  const { scrollProps, following } = useFollowEnd(chat.status === 'idle');
  const refusal = chat.refusal ?? access.data?.refusal;
  const busy = chat.status !== 'idle';
  // The same each render, so that the messages with notes do not render again.
  const { thread } = chat;
  const openNotebookHere = useCallback(() => openNotebook(thread()), [thread]);

  return (
    <Screen
      onBack={() => router.back()}
      closes={!fromChats && !fromNotebook}
      title={t('bite.title')}
      subtitle={title}
      action={
        <View style={styles.actions}>
          <TopBarButton
            icon="history"
            label={t('bite.chats.title')}
            // The chats are under a chat opened from them.
            onPress={() => (fromChats ? router.back() : openChats(chat.thread()))}
          />
          {fromNotebook ? null : (
            <TopBarButton
              icon="notebook"
              label={t('bite.notebook.title')}
              onPress={openNotebookHere}
            />
          )}
        </View>
      }
      scrolls={false}
    >
      <KeyboardAvoiding>
        <ScrollView
          {...scrollProps}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            recording && styles.dimmed,
            chat.messages.length > 0 && styles.bottom,
            { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {chat.messages.length === 0 ? (
            <ChatWelcome
              onAsk={refusal ? undefined : following(chat.send)}
              continueWith={continueWith}
            />
          ) : opening.some((query) => query.isPending) ? (
            // As a decided card folds into a line, rather than offering Apply or Add a moment.
            <LoadState queries={opening} />
          ) : (
            <ChatMessages
              messages={chat.messages}
              cards={cards}
              mediaUrls={mediaUrls.data}
              playing={playback.playing}
              onPlay={playback.toggle}
              status={chat.status}
              tool={chat.tool}
              onAskAgain={refusal || busy ? undefined : following(chat.askAgain)}
              onOpenNotebook={fromNotebook ? undefined : openNotebookHere}
            />
          )}
          {chat.failure ? (
            <View style={[styles.failure, { gap: spacing.sm }]}>
              <Text
                variant="caption"
                color="danger"
                accessibilityLiveRegion="polite"
                style={styles.flex}
              >
                {t(`bite.failures.${chat.failure}`)}
              </Text>
              {chat.retry ? (
                <TextLink label={t('common.tryAgain')} onPress={following(chat.retry)} />
              ) : null}
            </View>
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
          {refusal ? (
            <RefusalCard refusal={refusal} resetsAt={access.data?.resetsAt} />
          ) : (
            <ChatComposer
              onSend={following((draft) => chat.send(draft.text, draft.photos, draft.voice))}
              onStop={busy ? chat.stop : undefined}
              refused={refused}
              onRecording={onRecording}
            />
          )}
        </View>
      </KeyboardAvoiding>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dimmed: {
    opacity: 0.45,
  },
  /** The conversation sits on the composer, as chats do. */
  bottom: {
    justifyContent: 'flex-end',
  },
});
