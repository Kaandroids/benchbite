import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type AccountFormProps = {
  title: string;
  subtitle: string;
  onClose: () => void;
  /** The fields. */
  children: ReactNode;
  /** The button and the link to the other form, kept above the keyboard. */
  footer: ReactNode;
};

/** The layout of the forms that create an account and log in to one. */
export function AccountForm({ title, subtitle, onClose, children, footer }: AccountFormProps) {
  const { spacing } = useTheme();
  return (
    // The keyboard would cover the button at the bottom; Android resizes the window instead.
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen onBack={onClose} closes footer={footer}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text color="textMuted">{subtitle}</Text>
        </View>
        <View style={{ gap: spacing.xl, marginTop: spacing.sm }}>{children}</View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** "Already have an account? Log in": a question and a link to the other form. */
export function OtherForm({
  question,
  action,
  onPress,
}: {
  question: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.other}>
      <Text color="textMuted">{question} </Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
        <Text variant="label" color="primaryText">
          {action}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  other: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
