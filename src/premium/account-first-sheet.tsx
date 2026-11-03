import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { BITE_PEEK_ROOM, BitePeek } from '@/coach/bite-peek';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { useTheme } from '@/theme';

type AccountFirstSheetProps = {
  onCreate: () => void;
  onLogIn: () => void;
  onClose: () => void;
};

/**
 * Before a guest tries premium: an account first, so that the subscription stays theirs on a new
 * phone and can be restored, and what they logged comes along.
 */
export function AccountFirstSheet({ onCreate, onLogIn, onClose }: AccountFirstSheetProps) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <Sheet onClose={onClose}>
      <BitePeek />
      <View
        style={{
          gap: spacing.xs,
          paddingRight: BITE_PEEK_ROOM + spacing.md,
          marginBottom: spacing.sm,
        }}
      >
        <Text variant="headline" accessibilityRole="header">
          {t('premium.accountFirst.title')}
        </Text>
        <Text color="textMuted">{t('premium.accountFirst.body')}</Text>
      </View>
      <Button label={t('premium.accountFirst.create')} onPress={onCreate} />
      <TextLink label={t('premium.accountFirst.logIn')} size="regular" onPress={onLogIn} />
    </Sheet>
  );
}
