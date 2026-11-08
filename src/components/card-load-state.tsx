import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

type CardLoadStateProps = {
  /** The card's query, before it has data. */
  query: { isError: boolean; refetch: () => unknown };
  /** What the card says when its data could not load. */
  error: string;
};

/** A Progress card's data loading, the height of a chart, or the failure with Try again. */
export function CardLoadState({ query, error }: CardLoadStateProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return query.isError ? (
    <View style={[styles.placeholder, { gap: spacing.sm }]}>
      <Text variant="caption" color="textMuted" align="center">
        {error}
      </Text>
      <TextLink label={t('common.tryAgain')} onPress={() => void query.refetch()} />
    </View>
  ) : (
    <ActivityIndicator
      style={styles.placeholder}
      color={colors.primary}
      accessibilityLabel={t('common.loading')}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
