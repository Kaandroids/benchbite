import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { KeyboardAvoiding } from './keyboard-avoiding';
import { Text } from './text';

/** How long iOS takes to close a sheet, during which it cannot present another one. */
const CLOSE_MS = 400;

/** When the sheet that closed last began to close: as it is closed, or as it goes. */
let closedAt = -Infinity;

/** How long until the sheet that closed last has closed, on iOS; none elsewhere. */
function closingLeft(): number {
  return Platform.OS === 'ios' ? Math.max(0, closedAt + CLOSE_MS - Date.now()) : 0;
}

/**
 * Resolves once the sheet that closed last has closed, at once when none is closing: for code that
 * runs after the sheet has gone, such as a question asked once another was answered.
 */
export function whenSheetClosed(): Promise<void> {
  const left = closingLeft();
  return left > 0 ? new Promise((resolve) => setTimeout(resolve, left)) : Promise.resolve();
}

/**
 * Runs `action` once a sheet closing now has closed, for an action that may open another sheet,
 * which iOS would otherwise not show: for code that runs as the sheet is closed, before it has
 * gone, which it marks as closing for `whenSheetClosed` too.
 */
export function afterSheetCloses(action: () => void) {
  closedAt = Date.now();
  const left = closingLeft();
  if (left > 0) {
    setTimeout(action, left);
  } else {
    action();
  }
}

/**
 * A handler that closes a sheet with `onClose`, then runs `action` once it has closed, for an
 * action that opens an alert, a screen or another sheet, which iOS would not show over it.
 */
export function closeThen(onClose: () => void, action: () => void) {
  return () => {
    onClose();
    afterSheetCloses(action);
  };
}

/** A sheet's title, for screen readers its header. */
export function SheetTitle({ children }: { children: string }) {
  return (
    <Text variant="headline" accessibilityRole="header">
      {children}
    </Text>
  );
}

type SheetProps = {
  onClose: () => void;
  children: ReactNode;
};

/** A bottom sheet over a scrim, which closes when the scrim is tapped or on the back button. */
export function Sheet({ onClose, children }: SheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  useEffect(
    () => () => {
      closedAt = Date.now();
    },
    [],
  );
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      {/* On iOS, a modal gets no safe area without a provider of its own, which left the sheet's
          last button over the home indicator. */}
      <SafeAreaProvider>
        {/* A field in the sheet stays above the keyboard. */}
        <KeyboardAvoiding style={styles.root}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          />
          <SafeAreaView
            edges={['bottom']}
            style={{
              backgroundColor: colors.background,
              borderTopLeftRadius: radii.xl,
              borderTopRightRadius: radii.xl,
              padding: spacing.xl,
              gap: spacing.lg,
            }}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            {children}
          </SafeAreaView>
        </KeyboardAvoiding>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
  },
});
