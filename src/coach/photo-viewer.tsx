import { useTranslation } from 'react-i18next';
import { Image, Modal, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { RoundIconButton } from '@/components/ui/round-icon-button';
import { useTheme } from '@/theme';

type PhotoViewerProps = {
  uri: string;
  onClose: () => void;
};

/** A photo of the chat large, over the whole screen, until it is closed (board 14). */
export function PhotoViewer({ uri, onClose }: PhotoViewerProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait']}
    >
      {/* On iOS, a full-screen modal gets no safe area without a provider of its own, which put the
          close button under the status bar, where it could not be pressed (#425). */}
      <SafeAreaProvider style={[styles.root, { backgroundColor: colors.inverseSurface }]}>
        <Image
          source={{ uri }}
          resizeMode="contain"
          accessibilityLabel={t('bite.photos.viewer')}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={['top']} style={[styles.top, { padding: spacing.md }]}>
          <RoundIconButton
            icon="close"
            color="onInverse"
            background="inverseRaised"
            label={t('bite.photos.close')}
            onPress={onClose}
            size={40}
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  top: {
    alignItems: 'flex-end',
  },
});
