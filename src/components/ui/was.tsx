import { StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import type { TypographyVariant } from '@/theme';

/** A value before a change, struck through and followed by an arrow, inside the text of the new. */
export function Was({ value, variant }: { value: string; variant: TypographyVariant }) {
  return (
    <>
      <Text variant={variant} color="textMuted" style={styles.was}>
        {value}
      </Text>
      <Text variant={variant} color="textMuted">
        {' → '}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  was: {
    textDecorationLine: 'line-through',
  },
});
