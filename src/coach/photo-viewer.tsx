import { useTranslation } from 'react-i18next';
import { Image, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
      <View style={[styles.root, { backgroundColor: colors.inverseSurface }]}>
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
      </View>
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
