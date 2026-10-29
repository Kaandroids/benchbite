import { useTranslation } from 'react-i18next';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type AverageProps = {
  /** The amount with its unit, such as "2,115 kcal". */
  value: string;
  /** `strong` beside a card's title, regular under a value. */
  strong?: boolean;
  style?: StyleProp<TextStyle>;
};

/** An average of a span of days, after the average sign, read out as an average. */
export function Average({ value, strong = false, style }: AverageProps) {
  const { t } = useTranslation();
  return (
    <View accessible accessibilityLabel={t('nutrition.average', { value })} style={styles.row}>
      <Icon name="average" size={12} color="textMuted" />
      <Text variant={strong ? 'captionStrong' : 'caption'} color="textMuted" style={style}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
});
