import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
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

import { ChatComposer } from './chat-composer';
import { type PhotosProblem, usePhotoUrls } from './chat-photos';
import { ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';
import { proposalIds, useProposalStates } from './proposals';
import { RefusalCard } from './refusal-card';
import { firstPhotos, useThreadMessages, useThreadText } from './threads';
import { type BiteParams, continueChat, openChats, useOpenedChat } from './bite-route';
import type { ContinueWith } from './continue-card';
import { type Draft, useChat } from './use-chat';
import { useFollowEnd } from './use-follow-end';

/**
 * The chat with Bite (#294, ADR 0052): the one `thread` names, opened from the chats (#295), or a
 * new one. Opened from the tab bar, it goes on in the last chat while that is recent, and offers
 * it to continue otherwise (ADR 0055).
 */
export function BiteScreen() {
  const opened = useOpenedChat(useLocalSearchParams<BiteParams>());
  const { fromChats } = opened;
  const { threadId, key } = opened;
  const saved = useThreadMessages(threadId);
  const threadText = useThreadText();
  // A saved chat opens on its messages as they are now, never on ones kept from before.
  if (opened.waiting || (threadId !== undefined && !saved.isFetchedAfterMount)) {
    return (
      <Screen onBack={() => router.back()} closes={!fromChats}>
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
      title={
        threadText.title({
          title: saved.data.title,
          firstPhotos: firstPhotos(saved.data.messages),
        }) ?? undefined
      }
      start={{ threadId: threadId!, messages: saved.data.messages }}
    />
  ) : (
    <Chat
      key={threadId === undefined ? key : `gone-${threadId}`}
      fromChats={fromChats}
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
  /** The name of a saved thread the chat goes on in. */
  title?: string;
  start?: Parameters<typeof useChat>[0];
  /** The last chat, no longer recent, which a new chat offers to continue. */
  continueWith?: ContinueWith;
};

const EMPTY_DRAFT: Draft = { text: '', photos: [] };

function Chat({ fromChats, title, start, continueWith }: ChatProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<PhotosProblem>();
  // A message whose photos were refused comes back to the composer, to change.
  const chat = useChat(start, (refused, why) => {
    setDraft(refused);
    setProblem(why);
  });
  // Where the proposals in the chat stand, saved and new, loaded here once for all their cards.
  const proposalsOnScreen = proposalIds(chat.messages);
  const proposals = useProposalStates(proposalsOnScreen);
  // The photos the chat kept, read back once for all of them when it opens.
  const keptPhotos = (start?.messages ?? []).flatMap((message) =>
    (message.photos ?? []).flatMap((photo) => (photo.path ? [photo.path] : [])),
  );
  const photoUrls = usePhotoUrls(start?.threadId, keptPhotos);
  const access = useAiAccess();
  const { scrollProps, following } = useFollowEnd(chat.status === 'idle');
  const refusal = chat.refusal ?? access.data?.refusal;
  const busy = chat.status !== 'idle';

  return (
    <Screen
      onBack={() => router.back()}
      closes={!fromChats}
      title={t('bite.title')}
      subtitle={title}
      action={
        <TopBarButton
          icon="history"
          label={t('bite.chats.title')}
          // The chats are under a chat opened from them.
          onPress={() => (fromChats ? router.back() : openChats(chat.thread()))}
        />
      }
      scrolls={false}
    >
      <KeyboardAvoiding>
        <ScrollView
          {...scrollProps}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
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
          ) : proposalsOnScreen.length > 0 && proposals.isPending ? (
            // A saved chat's proposals show where they stand from the start, as a decided one
            // folds into a line, rather than offering Apply a moment.
            <LoadState queries={[proposals]} />
          ) : (
            <ChatMessages
              messages={chat.messages}
              proposals={proposals.data}
              loadingProposals={proposals.isFetching}
              photoUrls={photoUrls.data}
              status={chat.status}
              tool={chat.tool}
              onAskAgain={refusal || busy ? undefined : following(chat.askAgain)}
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
              draft={draft}
              onChange={setDraft}
              onSend={following(() => {
                chat.send(draft.text, draft.photos);
                setDraft(EMPTY_DRAFT);
              })}
              onStop={busy ? chat.stop : undefined}
              problem={problem}
              onProblem={setProblem}
            />
          )}
        </View>
      </KeyboardAvoiding>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  /** The conversation sits on the composer, as chats do. */
  bottom: {
    justifyContent: 'flex-end',
  },
});
