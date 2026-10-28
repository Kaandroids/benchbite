import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { IconName } from '@/components/ui/icon';
import { MessageView } from '@/components/ui/message-view';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

type ComingSoonProps = {
  icon: IconName;
  message: string;
  /** The tab's name at the top, with a button at its end such as the settings. */
  title?: string;
  action?: ReactNode;
};

/** Stands in for a tab whose screens are not built yet. */
export function ComingSoon({ icon, message, title, action }: ComingSoonProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    // Inside a tab, the bottom inset includes the tab bar, which covers the content on iOS.
    <SafeAreaView
      style={[styles.root, { backgroundColor: colors.background, padding: spacing.lg }]}
      edges={['top', 'bottom']}
    >
      {title ? (
        <View style={[styles.header, { paddingHorizontal: spacing.sm }]}>
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {action}
        </View>
      ) : null}
      <MessageView icon={icon} title={t('comingSoon.title')} message={message} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
