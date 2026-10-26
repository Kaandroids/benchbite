import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { FormScreen } from '@/components/ui/form-screen';
import { displayNameOf } from '@/profile/display-name';
import { NameField } from '@/profile/name-field';
import { useTheme } from '@/theme';

import { useStep } from '../use-step';

/** What to call the user, to greet them by it. It can be skipped. */
export function NicknameStep() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { answers, progress, next, back } = useStep('nickname');
  const [text, setText] = useState(answers.displayName ?? '');
  const name = displayNameOf(text);

  // Skipping also drops a name typed before going back.
  const skip = () => next({ displayName: undefined });
  const save = () => (name ? next({ displayName: name }) : skip());

  return (
    <FormScreen
      title={t('onboarding.steps.nickname.title')}
      subtitle={t('onboarding.nickname.subtitle')}
      progress={progress}
      onBack={back}
      footer={
        <View style={{ gap: spacing.md }}>
          <Button label={t('common.continue')} disabled={!name} onPress={save} />
          <Button variant="ghost" label={t('onboarding.nickname.skip')} onPress={skip} />
        </View>
      }
    >
      <NameField value={text} onChange={setText} onSubmit={save} />
    </FormScreen>
  );
}
