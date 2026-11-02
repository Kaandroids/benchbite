import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { RaisedPressable } from '@/components/ui/raised-pressable';
import { Text } from '@/components/ui/text';
import { useTheme, type ColorTokens } from '@/theme';

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
      <AddTile
        icon={<PhotoIcon />}
        iconBackground="iconBackground"
        title={t('nutrition.search.photo')}
        hint={t('nutrition.search.photoHint')}
        label={t('nutrition.photo.camera')}
        onPress={onPhoto}
      />
      <AddTile
        icon={<Icon name="barcode" size={22} color="text" />}
        iconBackground="track"
        title={t('nutrition.search.barcode')}
        hint={t('nutrition.search.barcodeHint')}
        label={t('nutrition.search.barcodeLabel')}
      />
    </View>
  );
}

type AddTileProps = {
  icon: ReactNode;
  iconBackground: keyof ColorTokens;
  title: string;
  hint: string;
  /** What the tile does, for screen readers; the hint is read after it. */
  label: string;
  /** Without it the tile is disabled. */
  onPress?: () => void;
};

function AddTile({ icon, iconBackground, title, hint, label, onPress }: AddTileProps) {
  const { colors, radii, spacing } = useTheme();
  const disabled = !onPress;
  return (
    <RaisedPressable
      style={styles.tile}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={disabled ? undefined : 'selection'}
      ledgeColor={colors.border}
      borderRadius={radii.lg}
      faceStyle={[
        styles.face,
        {
          gap: spacing.md,
          padding: spacing.md,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.iconTile,
          { borderRadius: radii.md, backgroundColor: colors[iconBackground] },
        ]}
      >
        {icon}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={disabled ? 'textMuted' : 'text'} style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.hint}>
          {hint}
        </Text>
      </View>
    </RaisedPressable>
  );
}

/** A camera with a small plus at its top right: a meal is added from a photo. */
function PhotoIcon() {
  const { colors } = useTheme();
  return (
    <View style={styles.photoIcon}>
      <View style={styles.camera}>
        <Icon name="camera" size={20} color="primary" />
      </View>
      <View style={[styles.plus, { backgroundColor: colors.iconBackground }]}>
        <Icon name="plus" size={10} color="primary" />
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
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
  },
  iconTile: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
  },
  hint: {
    fontSize: 12,
    lineHeight: 16,
  },
  photoIcon: {
    width: 26,
    height: 24,
  },
  camera: {
    position: 'absolute',
    left: 0,
    bottom: 0,
  },
  plus: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
