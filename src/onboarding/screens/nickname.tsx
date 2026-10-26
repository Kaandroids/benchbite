import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { displayNameOf } from '@/profile/display-name';
import { NameField } from '@/profile/name-field';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

/** What to call the user, to greet them by it. It can be skipped. */
export function NicknameStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('nickname');
  const [text, setText] = useState(answers.nickname ?? '');
  const name = displayNameOf(text);

  // Skipping also drops a name typed before going back.
  const skip = () => next({ nickname: undefined });
  const save = () => (name ? next({ nickname: name }) : skip());

  return (
    // The keyboard would cover the buttons at the bottom; Android resizes the window instead.
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen
        progress={progress}
        onBack={back}
        footer={
          <View style={{ gap: spacing.md }}>
            <Button label={t('common.continue')} disabled={!name} onPress={save} />
            <Button variant="ghost" label={t('onboarding.nickname.skip')} onPress={skip} />
          </View>
        }
      >
        <View style={{ gap: spacing.xs }}>
          <Text variant="title" accessibilityRole="header">
            {t('onboarding.steps.nickname.title')}
          </Text>
          <Text color="textMuted">{t('onboarding.nickname.subtitle')}</Text>
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <NameField value={text} onChange={setText} onSubmit={save} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
