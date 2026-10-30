import { router, useLocalSearchParams } from 'expo-router';
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
import { ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';
import { RefusalCard } from './refusal-card';
import { useThreadMessages } from './threads';
import { type BiteParams, chatOf } from './bite-route';
import { useChat } from './use-chat';
import { useFollowEnd } from './use-follow-end';

/**
 * The chat with Bite (#294, ADR 0052), opened from the middle of the tab bar: a new thread, or the
 * one `thread` names, opened from the chats (#295).
 */
export function BiteScreen() {
  const { threadId, key } = chatOf(useLocalSearchParams<BiteParams>());
  const saved = useThreadMessages(threadId);
  // A saved chat opens on its messages as they are now, never on ones kept from before.
  if (threadId !== undefined && !saved.isFetchedAfterMount) {
    return (
      <Screen onBack={() => router.back()} closes>
        <LoadState queries={[saved]} />
      </Screen>
    );
  }
  // A thread of its own for each chat opened, so that one's messages never go on in another; a
  // thread that is gone, as one deleted from the chats, gives way to a new chat.
  return saved.data ? (
    <Chat
      key={key}
      title={saved.data.title ?? undefined}
      start={{ threadId: threadId!, messages: saved.data.messages }}
    />
  ) : (
    <Chat key={threadId === undefined ? key : `gone-${threadId}`} />
  );
}

type ChatProps = {
  /** The name of a saved thread the chat goes on in. */
  title?: string;
  start?: Parameters<typeof useChat>[0];
};

function Chat({ title, start }: ChatProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const chat = useChat(start);
  const access = useAiAccess();
  const { scrollProps, following } = useFollowEnd(chat.status === 'idle');
  const refusal = chat.refusal ?? access.data?.refusal;
  const busy = chat.status !== 'idle';

  return (
    <Screen
      onBack={() => router.back()}
      closes
      title={t('bite.title')}
      subtitle={title}
      action={
        <TopBarButton
          icon="history"
          label={t('bite.chats.title')}
          onPress={() => router.push('/bite/chats')}
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
            <ChatWelcome onAsk={refusal ? undefined : following(chat.send)} />
          ) : (
            <ChatMessages
              messages={chat.messages}
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
            <ChatComposer onSend={following(chat.send)} onStop={busy ? chat.stop : undefined} />
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
