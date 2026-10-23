import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { Icon } from './icon';
import { ProgressBar } from './progress-bar';

type ScreenProps = {
  children: ReactNode;
  /** Shows a progress bar at the top, between 0 and 1. */
  progress?: number;
  /** Shows a back button at the top. */
  onBack?: () => void;
  /** Stays at the bottom while the content scrolls, typically the main button. */
  footer?: ReactNode;
  /** A button at the end of the top bar, such as Edit. */
  action?: ReactNode;
  /** A title in the middle of the top bar, instead of a progress bar. */
  title?: ReactNode;
};

/** The layout of a full-screen step: top bar, scrollable content and a fixed footer. */
export function Screen({ children, progress, onBack, footer, action, title }: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();
  const hasTopBar = progress !== undefined || onBack !== undefined || action !== undefined;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {hasTopBar ? (
        <View style={[styles.topBar, { paddingHorizontal: spacing.lg, gap: spacing.sm }]}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              onPress={onBack}
              hitSlop={8}
              style={styles.back}
            >
              <Icon name="back" color="textMuted" />
            </Pressable>
          ) : null}
          {progress !== undefined ? (
            <View style={styles.progress}>
              <ProgressBar value={progress} />
            </View>
          ) : (
            <View style={[styles.progress, styles.title]}>{title}</View>
          )}
          {/* Keeps a title in the middle when there is a back button but no action. */}
          {action ?? (title && onBack ? <View style={styles.back} /> : null)}
        </View>
      ) : null}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { padding: spacing.xl, gap: spacing.lg }]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: spacing.xl, paddingVertical: spacing.lg }}>{footer}</View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progress: {
    flex: 1,
  },
  title: {
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
  },
});
