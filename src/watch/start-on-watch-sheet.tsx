import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckBox } from '@/components/ui/check-box';
import { Icon } from '@/components/ui/icon';
import { IconTile } from '@/components/ui/icon-tile';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/theme';

import {
  cancelStartOnWatch,
  useStartOnWatchQuestion,
  type StartOnWatchAnswer,
} from './start-on-watch';

/** The sheet that asks `askStartOnWatch`'s question, over every screen. */
export function StartOnWatchSheet() {
  const current = useStartOnWatchQuestion();
  // A question left open when the sheet goes, as on signing out, does not start the workout.
  useEffect(() => cancelStartOnWatch, []);
  return current ? <Question answer={current.answer} /> : null;
}

function Question({ answer }: { answer: (value: StartOnWatchAnswer | null) => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [keep, setKeep] = useState(false);
  return (
    <Sheet onClose={() => answer(null)}>
      <View style={[styles.center, { gap: spacing.md }]}>
        <IconTile name="watch" size={64} />
        <Text variant="headline" accessibilityRole="header" style={styles.centerText}>
          {t('watch.startOnWatch.title')}
        </Text>
        <Text color="textMuted" style={styles.centerText}>
          {t('watch.startOnWatch.body')}
        </Text>
      </View>
      <Card style={{ gap: spacing.sm, padding: spacing.md }}>
        {(['both', 'alerts'] as const).map((point) => (
          <View key={point} style={[styles.point, { gap: spacing.sm }]}>
            <Icon name="check" size={20} color="success" />
            <Text style={styles.flex}>{t(`watch.startOnWatch.${point}`)}</Text>
          </View>
        ))}
      </Card>
      <Button
        label={t('watch.startOnWatch.onWatch')}
        onPress={() => answer({ onWatch: true, keep })}
      />
      <Button
        variant="secondary"
        label={t('watch.startOnWatch.onPhone')}
        onPress={() => answer({ onWatch: false, keep })}
      />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: keep }}
        onPress={() => setKeep((value) => !value)}
        style={[styles.keep, { gap: spacing.sm }]}
      >
        <CheckBox checked={keep} />
        <Text color="textMuted">{t('watch.startOnWatch.keep')}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  point: { flexDirection: 'row', alignItems: 'flex-start' },
  flex: { flex: 1 },
  keep: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44 },
});
