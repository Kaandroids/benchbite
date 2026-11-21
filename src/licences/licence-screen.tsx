import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { Card, listDivider } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { LICENCES } from './libraries';

type LicenceScreenProps = {
  /** Which of the licences, by its place in the list. */
  index: number;
};

/**
 * One licence (#29, ADR 0160): its text, and the libraries under it with the copyright lines of
 * their own licence files, which the licences ask to keep with the software. The texts stay in
 * their own language, as they are what was agreed to.
 */
export function LicenceScreen({ index }: LicenceScreenProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const licence = LICENCES[index];

  // An address that names no licence, as one typed by hand.
  if (!licence) {
    return (
      <Screen onBack={() => router.back()} title={t('licences.title')}>
        {null}
      </Screen>
    );
  }
  return (
    <Screen onBack={() => router.back()} title={licence.id}>
      <View style={{ gap: spacing.sm }}>
        <Caption accessibilityRole="header">{t('licences.text')}</Caption>
        <Card>
          <Text variant="caption" color="textMuted">
            {licence.text}
          </Text>
        </Card>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Caption accessibilityRole="header">
          {t('licences.under', { count: licence.libraries.length })}
        </Caption>
        <Card list>
          {licence.libraries.map(({ name, copyright, text }, row) => (
            <View
              key={name}
              style={[
                { gap: spacing.xs, paddingVertical: spacing.md },
                listDivider(row === 0, colors.border),
              ]}
            >
              <Text variant="label">{name}</Text>
              {copyright.map((line) => (
                <Text key={line} variant="caption" color="textMuted">
                  {line}
                </Text>
              ))}
              {text ? (
                <Text variant="caption" color="textMuted">
                  {text}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </View>
    </Screen>
  );
}
