import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ActionCard } from '@/components/ui/action-card';
import { useTheme } from '@/theme';

type AddTilesProps = {
  /** Opens the sheet that logs a meal from photos. */
  onPhoto: () => void;
};

/**
 * The other ways to add food, side by side under the search: a photo that Bite estimates, and a
 * barcode, which is shown but not yet available.
 */
export function AddTiles({ onPhoto }: AddTilesProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.md }]}>
      <View style={styles.tile}>
        <ActionCard
          icon="camera"
          iconColor="dinner"
          iconBackground="dinnerBackground"
          title={t('nutrition.search.photo')}
          hint={t('nutrition.search.photoHint')}
          label={t('nutrition.photo.camera')}
          onPress={onPhoto}
          singleLine
        />
      </View>
      <View style={styles.tile}>
        <ActionCard
          icon="barcode"
          iconColor="water"
          iconBackground="waterBackground"
          title={t('nutrition.search.barcode')}
          hint={t('nutrition.search.barcodeHint')}
          label={t('nutrition.search.barcodeLabel')}
          singleLine
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  tile: {
    flex: 1,
  },
});
