import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { KeyboardAvoiding } from './keyboard-avoiding';
import { Screen } from './screen';
import type { SectionProgressProps } from './section-progress';
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
  /** Shows a cross at the end of the top bar, for leaving a flow of steps. */
  onClose?: () => void;
  /** Shows the progress through the sections of a flow at the top. */
  progress?: SectionProgressProps;
};

/** A screen of text fields under a title, such as creating an account or giving a name. */
export function FormScreen({
  title,
  subtitle,
  children,
  footer,
  onBack,
  closes = false,
  onClose,
  progress,
}: FormScreenProps) {
  const { spacing } = useTheme();
  return (
    <KeyboardAvoiding>
      <Screen onBack={onBack} closes={closes} onClose={onClose} progress={progress} footer={footer}>
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
