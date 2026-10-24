import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

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
      <View style={styles.root}>
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
      </View>
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
