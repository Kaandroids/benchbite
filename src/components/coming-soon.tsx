import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { useTheme } from '@/theme';

type ComingSoonProps = {
  icon: IconName;
  message: string;
  /** Shown below the message, for example a link in development. */
  children?: ReactNode;
};

/** Stands in for a tab whose screens are not built yet. */
export function ComingSoon({ icon, message, children }: ComingSoonProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background, padding: spacing.lg }]}
      edges={['top', 'bottom']}
    >
      <MessageView icon={icon} title={t('comingSoon.title')} message={message} />
      {children ? <View style={styles.extra}>{children}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  extra: {
    alignItems: 'center',
  },
});
