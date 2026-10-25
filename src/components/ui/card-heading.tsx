import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fonts, useTheme } from '@/theme';

import { Icon, type IconName } from './icon';
import { Text } from './text';

/** A card's title with an orange icon before it, and anything shown at its end. */
export function CardHeading({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children?: ReactNode;
}) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <Icon name={icon} size={18} color="primary" />
      <Text variant="headline" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontFamily: fonts.black,
    fontSize: 17,
    lineHeight: 22,
  },
});
