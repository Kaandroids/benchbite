import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { ScreenTitle } from './screen-title';
import { SectionProgress, type SectionProgressProps } from './section-progress';
import { TopBarButton } from './top-bar-button';

type ScreenProps = {
  children: ReactNode;
  /** Shows the progress through the sections of a flow at the top. */
  progress?: SectionProgressProps;
  /** Shows a back button at the top. */
  onBack?: () => void;
  /** Shows the back button as a cross, for leaving without saving. */
  closes?: boolean;
  /** Stays at the bottom while the content scrolls, typically the main button. */
  footer?: ReactNode;
  /** A button at the end of the top bar, such as Edit. */
  action?: ReactNode;
  /**
   * Shows a cross at the end of the top bar, for leaving a flow of steps from any of them. It takes
   * the place of `action`, so a screen has one or the other.
   */
  onClose?: () => void;
  /**
   * A title in the middle of the top bar, instead of a progress bar: text, shown as the screen's
   * header on one line, or a component for a title that needs more.
   */
  title?: ReactNode;
  /** A short line under a text title, such as the day of a meal; not shown with a component. */
  subtitle?: string;
  /** False for content that scrolls itself, such as a long virtualized list. */
  scrolls?: boolean;
};

/** The layout of a full-screen step: top bar, scrollable content and a fixed footer. */
export function Screen({
  children,
  progress,
  onBack,
  closes = false,
  footer,
  action,
  onClose,
  title,
  subtitle,
  scrolls = true,
}: ScreenProps) {
  const { colors, spacing } = useTheme();
  const { t } = useTranslation();
  const end = onClose ? (
    <TopBarButton icon="close" label={t('common.close')} onPress={onClose} />
  ) : (
    action
  );
  const hasTopBar = progress !== undefined || onBack !== undefined || end !== undefined;

  return (
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background }]}
      edges={['top', 'bottom']}
    >
      {hasTopBar ? (
        <View style={[styles.topBar, { paddingHorizontal: spacing.lg, gap: spacing.sm }]}>
          {onBack ? (
            <TopBarButton
              icon={closes ? 'close' : 'back'}
              label={closes ? t('common.close') : t('common.back')}
              onPress={onBack}
            />
          ) : null}
          {progress !== undefined ? (
            <View style={styles.progress}>
              <SectionProgress {...progress} />
            </View>
          ) : (
            <View style={[styles.progress, styles.title]}>
              {typeof title === 'string' ? (
                <ScreenTitle title={title} subtitle={subtitle} />
              ) : (
                title
              )}
            </View>
          )}
          {/* Keeps a title in the middle when there is a back button but no action. */}
          {end ?? (title !== undefined && onBack ? <View style={styles.spacer} /> : null)}
        </View>
      ) : null}
      {scrolls ? (
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { padding: spacing.xl, gap: spacing.lg },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
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
  // As wide as a top bar button, so that a title stays in the middle.
  spacer: {
    width: 44,
    height: 44,
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
