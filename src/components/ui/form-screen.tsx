import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { KeyboardAvoiding } from './keyboard-avoiding';
import { Screen } from './screen';
import { Text } from './text';

type FormScreenProps = {
  title: string;
  subtitle: string;
  /** The fields. */
  children: ReactNode;
  /** The buttons, kept above the keyboard. */
  footer: ReactNode;
  onBack?: () => void;
  /** Shows the back button as a cross, for leaving without saving. */
  closes?: boolean;
  /** Shows a progress bar at the top, between 0 and 1. */
  progress?: number;
};

/** A screen of text fields under a title, such as creating an account or giving a name. */
export function FormScreen({
  title,
  subtitle,
  children,
  footer,
  onBack,
  closes = false,
  progress,
}: FormScreenProps) {
  const { spacing } = useTheme();
  return (
    <KeyboardAvoiding>
      <Screen onBack={onBack} closes={closes} progress={progress} footer={footer}>
        <View style={{ gap: spacing.xs }}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          <Text color="textMuted">{subtitle}</Text>
        </View>
        <View style={{ gap: spacing.xl, marginTop: spacing.sm }}>{children}</View>
      </Screen>
    </KeyboardAvoiding>
  );
}
