import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { ChatComposer } from './chat-composer';
import { ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';
import { RefusalCard } from './refusal-card';
import { useAiAccess, useChat } from './use-chat';

/** Reasons Bite gives no answer, each with its own line; any other is said as unavailable. */
const FAILURES = ['unavailable', 'blocked', 'not_saved', 'request_too_large'] as const;
type Failure = (typeof FAILURES)[number];

const failureOf = (reason: string): Failure =>
  FAILURES.find((failure) => failure === reason) ?? 'unavailable';

/** The chat with Bite (#294, ADR 0052), opened from the middle of the tab bar. */
export function BiteScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const chat = useChat();
  const access = useAiAccess();
  const scroll = useRef<ScrollViewInstance>(null);
  const refusal = chat.refusal ?? access.data?.refusal;
  const busy = chat.status !== 'idle';

  return (
    <Screen onBack={() => router.back()} closes title={t('bite.title')} scrolls={false}>
      <KeyboardAvoiding>
        <ScrollView
          ref={scroll}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            chat.messages.length > 0 && styles.bottom,
            { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {chat.messages.length === 0 ? (
            <ChatWelcome onAsk={refusal ? undefined : chat.send} />
          ) : (
            <ChatMessages messages={chat.messages} status={chat.status} tool={chat.tool} />
          )}
          {chat.failure ? (
            <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
              {t(`bite.failures.${failureOf(chat.failure)}`)}
            </Text>
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
          {refusal ? (
            <RefusalCard refusal={refusal} resetsAt={access.data?.resetsAt} />
          ) : (
            <ChatComposer onSend={chat.send} onStop={busy ? chat.stop : undefined} />
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
  /** The conversation sits on the composer, as chats do. */
  bottom: {
    justifyContent: 'flex-end',
  },
});
