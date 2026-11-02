import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { TextLink } from '@/components/ui/text-link';
import { dbErrorMessage } from '@/lib/errors';
import { useTheme } from '@/theme';

import { type NoteCard, useAnswerNote } from './notes';

type NoteAskCardProps = {
  note: NoteCard;
  /** While where it stands is not known yet, as for a saved chat opening. */
  waiting?: boolean;
};

/**
 * A note Bite asked to save, while the user has saving from chats off (board 24): what it would
 * keep, saved to the notebook with a tap, or removed with Not now.
 */
export function NoteAskCard({ note, waiting = false }: NoteAskCardProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const answer = useAnswerNote(note);
  return (
    <Card>
      <View style={[styles.row, { gap: spacing.md }]}>
        <View
          style={[styles.icon, { borderRadius: radii.md, backgroundColor: colors.primaryWash }]}
        >
          <Icon name="notebook" size={18} color="primaryText" />
        </View>
        <View style={styles.flex}>
          <Text variant="label" accessibilityRole="header">
            {t('bite.notes.ask.title')}
          </Text>
          <Text variant="caption" color="textMuted">
            {t('bite.notes.ask.note', {
              category: t(`bite.notebook.categories.${note.category}`),
              text: note.text,
            })}
          </Text>
        </View>
      </View>
      {answer.isError ? (
        <Text color="danger">
          {dbErrorMessage(
            answer.error,
            [['notesInUseLimit', t('bite.notebook.refusals.full')]],
            t('bite.notebook.notSaved'),
          )}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Button
          label={t('bite.notes.ask.save')}
          size="small"
          style={styles.flex}
          disabled={waiting || (answer.isPending && answer.variables !== 'save')}
          loading={answer.isPending && answer.variables === 'save'}
          onPress={() => answer.mutate('save')}
        />
        <TextLink
          label={t('bite.notes.ask.notNow')}
          tone="muted"
          size="regular"
          align="center"
          disabled={waiting || answer.isPending}
          onPress={() => answer.mutate('decline')}
        />
      </View>
    </Card>
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
  icon: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
