import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { RoundIconButton } from '@/components/ui/round-icon-button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

/** The longest message coach-chat takes. */
export const MAX_MESSAGE_LENGTH = 4000;

type ChatComposerProps = {
  onSend: (text: string) => void;
  /** Stops Bite's answer; set while Bite answers, which the send button becomes. */
  onStop?: () => void;
};

/** Where the user writes to Bite, and the note under it that Bite can be wrong. */
export function ChatComposer({ onSend, onStop }: ChatComposerProps) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useTheme();
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        style={[
          styles.field,
          { gap: spacing.xs, backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <TextInput
          accessibilityLabel={t('bite.message')}
          placeholder={t('bite.ask')}
          placeholderTextColor={colors.placeholder}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MAX_MESSAGE_LENGTH}
          style={[
            typography.body,
            styles.input,
            { color: colors.text, paddingHorizontal: spacing.md },
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
            disabled={!text.trim()}
          />
        )}
      </View>
      <Text variant="caption" color="textMuted" align="center">
        {t('bite.mistakes')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: 26,
    padding: 4,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: 11,
    paddingBottom: 11,
  },
});
