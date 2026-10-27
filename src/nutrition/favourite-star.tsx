import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { isDbError } from '@/lib/errors';
import { useTheme } from '@/theme';

import { refKey, type FoodRef } from './foods';
import { useFavouriteKeys, useSetFavourite } from './quick-foods';

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

/**
 * A star, filled for a favourite. Drawn rather than taken from the icon set, whose Android symbols
 * have no filled variant.
 */
export function Star({ filled, size = 24 }: { filled: boolean; size?: number }) {
  const { colors } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={STAR}
        fill={filled ? colors.primary : 'none'}
        stroke={filled ? colors.primary : colors.textMuted}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Stars a food for the Favourites list of the add screen, or takes its star away (ADR 0037). */
export function FavouriteButton({ food, name }: { food: FoodRef; name: string }) {
  const { t } = useTranslation();
  const favourites = useFavouriteKeys();
  const setFavourite = useSetFavourite();
  // Shows the change while it is saved.
  const favourite = setFavourite.isPending
    ? setFavourite.variables.favourite
    : favourites.has(refKey(food));

  const toggle = () => {
    void Haptics.selectionAsync();
    setFavourite.mutate(
      { food, favourite: !favourite },
      {
        onSuccess: () =>
          AccessibilityInfo.announceForAccessibility(
            t(favourite ? 'nutrition.quick.favouriteRemoved' : 'nutrition.quick.favouriteAdded'),
          ),
        onError: (error) =>
          AccessibilityInfo.announceForAccessibility(
            t(
              isDbError(error, 'favouriteLimit')
                ? 'nutrition.quick.favouriteLimit'
                : 'nutrition.quick.favouriteError',
            ),
          ),
      },
    );
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        favourite ? 'nutrition.quick.unfavourite' : 'nutrition.quick.favourite',
      )}
      accessibilityHint={name}
      accessibilityState={{ selected: favourite }}
      onPress={toggle}
      hitSlop={8}
      style={styles.button}
    >
      <Star filled={favourite} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
