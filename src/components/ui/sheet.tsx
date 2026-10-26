import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

import { KeyboardAvoiding } from './keyboard-avoiding';

/** How long iOS takes to close a sheet, during which it cannot present another one. */
const CLOSE_MS = 400;

/**
 * Runs `action` once a sheet closing now has closed, for an action that may open another sheet,
 * which iOS would otherwise not show.
 */
export function afterSheetCloses(action: () => void) {
  if (Platform.OS === 'ios') {
    setTimeout(action, CLOSE_MS);
  } else {
    action();
  }
}

type SheetProps = {
  onClose: () => void;
  children: ReactNode;
};

/** A bottom sheet over a scrim, which closes when the scrim is tapped or on the back button. */
export function Sheet({ onClose, children }: SheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
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
