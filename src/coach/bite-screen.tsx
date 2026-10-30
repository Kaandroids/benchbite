import { router } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { KeyboardAvoiding } from '@/components/ui/keyboard-avoiding';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

import { ChatComposer } from './chat-composer';
import { ChatMessages } from './chat-messages';
import { ChatWelcome } from './chat-welcome';
import { RefusalCard } from './refusal-card';
import { useAiAccess, useChat } from './use-chat';

/** How close to the end of the chat counts as reading its end. */
const END_SLACK = 40;

/** The chat with Bite (#294, ADR 0052), opened from the middle of the tab bar. */
export function BiteScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const chat = useChat();
  const access = useAiAccess();
  const scroll = useRef<ScrollViewInstance>(null);
  // Whether the user reads the end of the chat, which then follows what comes; scrolled up, they
  // stay where they read.
  const atEnd = useRef(true);
  const height = useRef(0);
  const toEnd = () => scroll.current?.scrollToEnd({ animated: chat.status === 'idle' });
  const refusal = chat.refusal ?? access.data?.refusal;
  const busy = chat.status !== 'idle';
  const lastQuestion = chat.messages.findLast((message) => message.role === 'user');

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
          scrollEventThrottle={100}
          onScroll={({ nativeEvent: { contentOffset, layoutMeasurement, contentSize } }) => {
            atEnd.current =
              contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
          }}
          onContentSizeChange={() => atEnd.current && toEnd()}
          onLayout={({ nativeEvent }) => {
            // The keyboard opening shrinks the chat: the end stays in sight.
            if (nativeEvent.layout.height < height.current && atEnd.current) toEnd();
            height.current = nativeEvent.layout.height;
          }}
        >
          {chat.messages.length === 0 ? (
            <ChatWelcome onAsk={refusal ? undefined : chat.send} />
          ) : (
            <ChatMessages
              messages={chat.messages}
              status={chat.status}
              tool={chat.tool}
              onAskAgain={refusal || chat.status !== 'idle' ? undefined : chat.askAgain}
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
              {/* An unanswered question offers to ask again itself. */}
              {chat.status === 'idle' && !lastQuestion?.unanswered ? (
                <TextLink label={t('common.tryAgain')} onPress={chat.retry} />
              ) : null}
            </View>
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
  failure: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** The conversation sits on the composer, as chats do. */
  bottom: {
    justifyContent: 'flex-end',
  },
});
