import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { radii, useTheme } from '@/theme';

import { photoDataUri } from './chat-photos';

/** A photo in the tray, and the tile that adds one. */
const TILE = 64;

type PhotoTrayProps = {
  /** The photos to send, as base64 JPEG. */
  photos: string[];
  /** How many more are being prepared, each a tile that waits. */
  preparing: number;
  /** The photo coach-chat refused, by its index, marked until the photos change. */
  refused?: number;
  onRemove: (index: number) => void;
  /** Adds photos; left out once there are 3. */
  onAdd?: () => void;
};

/** The photos waiting above the text of a message (board 7b), each with an ×, and a tile to add more. */
export function PhotoTray({ photos, preparing, refused, onRemove, onAdd }: PhotoTrayProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View style={[styles.tray, { gap: spacing.sm - 2, padding: spacing.sm - 2, paddingBottom: 0 }]}>
      {photos.map((data, index) => (
        <View key={`${index}-${data.length}`} style={styles.tile}>
          <Image
            source={{ uri: photoDataUri(data) }}
            accessibilityLabel={t('bite.photos.photo', { number: index + 1 })}
            style={[
              styles.photo,
              { backgroundColor: colors.track },
              index === refused && { borderWidth: 2, borderColor: colors.danger },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('bite.photos.remove', { number: index + 1 })}
            onPress={() => onRemove(index)}
            hitSlop={10}
            style={[styles.remove, { backgroundColor: colors.scrim }]}
          >
            <Icon name="close" size={11} color="onInverse" />
          </Pressable>
        </View>
      ))}
      {Array.from({ length: preparing }, (_, index) => (
        <View
          key={`preparing-${index}`}
          accessible
          accessibilityLabel={t('bite.photos.preparing')}
          style={[
            styles.tile,
            styles.center,
            { backgroundColor: colors.track, borderRadius: radii.md },
          ]}
        >
          <ActivityIndicator color={colors.textMuted} />
        </View>
      ))}
      {onAdd ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('bite.photos.addMore')}
          onPress={onAdd}
          style={({ pressed }) => [
            styles.tile,
            styles.center,
            styles.add,
            { borderColor: colors.border, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="plus" size={20} color="textMuted" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tray: {
    flexDirection: 'row',
  },
  tile: {
    width: TILE,
    height: TILE,
  },
  photo: {
    width: TILE,
    height: TILE,
    borderRadius: radii.md,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radii.md,
  },
});
