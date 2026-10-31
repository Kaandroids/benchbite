// What Bite's cards in the chat share once the user acted on one: the line it folds into, and why
// it was refused.
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { radii, spacing, useTheme, type ColorTokens } from '@/theme';

import type { ProposalFailure } from './proposals';

/**
 * A decided card, folded into a line (boards 5, 10 and 11b): what became of it, a short summary
 * under it, and Undo after Apply or Add.
 */
export function DecidedLine({
  icon,
  iconColor,
  text,
  detail,
  action,
}: {
  icon: IconName;
  iconColor: keyof ColorTokens;
  text: string;
  detail?: string;
  action?: ReactNode;
}) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.line,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Icon name={icon} size={18} color={iconColor} />
      <View style={[styles.flex, styles.text]} accessible accessibilityLiveRegion="polite">
        <Text variant="bodyStrong">{text}</Text>
        {detail ? (
          <Text variant="caption" color="textMuted">
            {detail}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

/** Why a card could not be decided, added or undone. */
export function CardRefusal({ failure }: { failure: ProposalFailure }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Text
      variant="caption"
      color={failure === 'failed' ? 'danger' : 'textMuted'}
      accessibilityLiveRegion="polite"
      style={{ paddingTop: spacing.xs }}
    >
      {t(`bite.proposal.refusals.${failure}`)}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  text: {
    paddingVertical: spacing.sm,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radii.md + 2,
  },
});
