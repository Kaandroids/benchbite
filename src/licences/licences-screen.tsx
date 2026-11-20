import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Caption } from '@/components/ui/caption';
import { Card, listDivider } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import { LICENCES, licenceHref } from './libraries';

/**
 * What the app owes its thanks for besides its libraries, each with where it comes from. The food
 * values come first: their licence (CC BY 4.0) asks to name the source and what was changed.
 */
const CREDITS = [
  { key: 'food', url: 'https://blsdb.de' },
  { key: 'exercises', url: 'https://github.com/yuhonas/free-exercise-db' },
  { key: 'typeface', url: 'https://fonts.google.com/specimen/Nunito' },
] as const;

/**
 * The licences and credits (#29, ADR 0160): the data and the typeface the app is built with, and
 * the open source libraries that are part of it, by their licence. A licence opens its text and
 * the libraries under it.
 */
export function LicencesScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const row = { gap: spacing.md, paddingVertical: spacing.md };

  return (
    <Screen onBack={() => router.back()} title={t('licences.title')}>
      <View style={{ gap: spacing.sm }}>
        <Caption accessibilityRole="header">{t('licences.credits')}</Caption>
        <Card list>
          {CREDITS.map(({ key, url }, index) => (
            <Pressable
              key={key}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(url)}
              style={({ pressed }) => [
                styles.row,
                row,
                { opacity: pressed ? 0.6 : 1 },
                listDivider(index === 0, colors.border),
              ]}
            >
              <View style={styles.flex}>
                <Text variant="label">{t(`licences.${key}.title`)}</Text>
                <Text variant="caption" color="textMuted">
                  {t(`licences.${key}.body`)}
                </Text>
              </View>
              <Icon name="link" size={18} color="textMuted" />
            </Pressable>
          ))}
        </Card>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Caption accessibilityRole="header">{t('licences.libraries')}</Caption>
        <Card list>
          {LICENCES.map(({ id, libraries }, index) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              onPress={() => router.push(licenceHref(index))}
              style={({ pressed }) => [
                styles.row,
                row,
                { opacity: pressed ? 0.6 : 1 },
                listDivider(index === 0, colors.border),
              ]}
            >
              <Text variant="label" style={styles.flex}>
                {id}
              </Text>
              <Text variant="caption" color="textMuted">
                {t('licences.count', { count: libraries.length })}
              </Text>
              <Icon name="forward" size={18} color="textMuted" />
            </Pressable>
          ))}
        </Card>
        <Text variant="caption" color="textMuted">
          {t('licences.note')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
});
