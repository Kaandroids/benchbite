import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { Card, listDivider } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FieldLabel, useFieldStyle } from '@/components/ui/field';
import { Icon, type IconName } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { Toast } from '@/components/ui/toast';
import { TopBarButton } from '@/components/ui/top-bar-button';
import { isoWeekday, useClockFormat, useShortDateFormat, useWeekdayFormat } from '@/i18n/dates';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { openNoteChat } from './bite-route';
import {
  groupNotes,
  MAX_NOTE_LENGTH,
  type Note,
  NOTE_CATEGORIES,
  type NoteCategory,
  type NotebookSection,
  noteRefusal,
  useDeleteNote,
  useNotes,
  useRestoreNote,
  useSaveNote,
  useSavesNotes,
  useSetSavesNotes,
} from './notebook';
import { useDeferredDelete } from './use-deferred-delete';

const SECTION_ICONS: Record<NotebookSection, IconName> = {
  health: 'warning',
  injury: 'injury',
  training: 'dumbbell',
  food: 'meal',
  goal: 'target',
  lifestyle: 'sun',
};

const CATEGORY_ICONS: Record<NoteCategory, IconName> = {
  allergy: 'warning',
  health: 'heart',
  injury: 'injury',
  training: 'dumbbell',
  food: 'meal',
  goal: 'target',
  lifestyle: 'sun',
};

/** What a note sheet edits: a new note, or one of the notebook's. */
type Editing = { note?: Note };

/**
 * Bite's notebook (#296, ADR 0071, boards 20–26): what Bite knows about the user, by section, with
 * where each note came from, whether Bite saves notes from chats, and the notes Bite archived. A
 * note opens to be changed or removed, which can be undone while its toast shows.
 */
export function NotebookScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const notes = useNotes();
  const deleteNote = useDeleteNote();
  const { deleting, remove, undo, settle } = useDeferredDelete<Note>(deleteNote.mutate);
  const [open, setOpen] = useState<Note | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const add = (
    <TopBarButton icon="plus" label={t('bite.notebook.add')} onPress={() => setEditing({})} />
  );
  if (notes.data === undefined) {
    return (
      <Screen onBack={() => router.back()} title={t('bite.notebook.title')} action={add}>
        <LoadState queries={[notes]} />
      </Screen>
    );
  }

  const shown = notes.data.filter((note) => note.id !== deleting?.id);
  const { sections, past } = groupNotes(shown);

  return (
    <Screen
      onBack={() => router.back()}
      title={t('bite.notebook.title')}
      action={add}
      // The toast stays at the bottom of the screen, over the notes as they scroll.
      scrolls={false}
    >
      {sections.length === 0 && past.length === 0 ? (
        <EmptyNotebook onAdd={() => setEditing({})} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg }}
        >
          <View style={[styles.row, { gap: spacing.md }]}>
            <BiteAvatar size={44} expression="neutral" />
            <Text variant="caption" color="textMuted" style={styles.flex}>
              {t('bite.notebook.intro')}
            </Text>
          </View>
          <SavingSwitch />
          {sections.map((section) => (
            <View key={section.key} style={{ gap: spacing.sm }}>
              <SectionHeading icon={SECTION_ICONS[section.key]}>
                {t(`bite.notebook.sections.${section.key}`)}
              </SectionHeading>
              <Card list>
                {section.notes.map((note, index) => (
                  <NoteRow
                    key={note.id}
                    note={note}
                    first={index === 0}
                    onPress={() => setOpen(note)}
                  />
                ))}
              </Card>
            </View>
          ))}
          {past.length > 0 ? <PastNotes notes={past} /> : null}
        </ScrollView>
      )}
      {deleteNote.isError ? (
        <Text color="danger" align="center">
          {t('bite.notebook.notRemoved')}
        </Text>
      ) : null}
      {deleting ? (
        <Toast
          key={deleting.id}
          message={t('bite.notebook.removed')}
          action={{ label: t('bite.notebook.undo'), onPress: undo }}
          onHide={settle}
        />
      ) : null}
      {open ? (
        <NoteSheet
          note={open}
          onClose={() => setOpen(null)}
          onEdit={() => {
            setOpen(null);
            afterSheetCloses(() => setEditing({ note: open }));
          }}
          onRemove={() => {
            setOpen(null);
            remove(open);
          }}
        />
      ) : null}
      {editing ? <EditSheet note={editing.note} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

/** Saving notes from chats: on, Bite saves them; off, it asks first. */
function SavingSwitch() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const saves = useSavesNotes();
  const setSaves = useSetSavesNotes();
  return (
    <Card style={[styles.row, { gap: spacing.md }]}>
      <View style={styles.flex}>
        <Text variant="bodyStrong">{t('bite.notebook.saving')}</Text>
        <Text variant="caption" color="textMuted">
          {t('bite.notebook.savingNote')}
        </Text>
      </View>
      <Switch
        accessibilityLabel={t('bite.notebook.saving')}
        value={saves.data ?? true}
        onValueChange={(value) => setSaves.mutate(value)}
      />
    </Card>
  );
}

function SectionHeading({ icon, children }: { icon: IconName; children: string }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: spacing.xs + 2, paddingLeft: spacing.xs }]}>
      <Icon name={icon} size={15} color="primaryText" />
      <Text variant="captionStrong" color="textMuted" accessibilityRole="header">
        {children.toLocaleUpperCase()}
      </Text>
    </View>
  );
}

/** Where a note came from and when, as "From a chat · Oct 12", or "Yesterday". */
function useSourceLine() {
  const { t } = useTranslation();
  const [today] = useState(() => new Date());
  const date = useShortDateFormat(today);
  return (note: Note) => {
    const days = Math.round(
      (startOfDay(today).getTime() - startOfDay(note.createdAt).getTime()) / 86_400_000,
    );
    const when =
      days === 0
        ? t('bite.notebook.today')
        : days === 1
          ? t('bite.notebook.yesterday')
          : date(note.createdAt);
    return t(`bite.notebook.sources.${note.source}`, { when });
  };
}

/** When Bite asks again: on a weekday within the week, or on a date, as "Friday" or "Nov 20". */
function useReviewDay() {
  const [today] = useState(() => new Date());
  const weekday = useWeekdayFormat('long');
  const date = useShortDateFormat(today);
  return (day: string) => {
    const on = new Date(`${day}T00:00:00`);
    const days = (on.getTime() - startOfDay(today).getTime()) / 86_400_000;
    return days >= 0 && days < 7 ? weekday(isoWeekday(on)) : date(on);
  };
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type NoteRowProps = { note: Note; first: boolean; onPress: () => void };

/** A note: its text, where it came from, and when Bite asks again about it. */
function NoteRow({ note, first, onPress }: NoteRowProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const source = useSourceLine();
  const reviewDay = useReviewDay();
  const review = note.reviewOn
    ? t('bite.notebook.askAgain', { day: reviewDay(note.reviewOn) })
    : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[note.text, source(note), review].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        listDivider(first, colors.border),
        {
          gap: spacing.sm,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.selected : undefined,
        },
      ]}
    >
      <View style={[styles.flex, { gap: 2 }]}>
        <Text variant="bodyStrong">{note.text}</Text>
        <Text variant="caption" color="textMuted">
          {source(note)}
        </Text>
        {note.reviewOn ? (
          <View
            style={[
              styles.tag,
              {
                gap: spacing.xs,
                marginTop: spacing.xs,
                paddingHorizontal: spacing.sm,
                borderRadius: radii.sm,
                backgroundColor: colors.primaryWash,
              },
            ]}
          >
            <Icon name="timer" size={13} color="primaryText" />
            <Text variant="captionStrong" color="primaryText">
              {review}
            </Text>
          </View>
        ) : null}
      </View>
      <Icon name="forward" size={18} color="textMuted" />
    </Pressable>
  );
}

/** The notes Bite archived, folded under their count, each with why and a way to restore it. */
function PastNotes({ notes }: { notes: Note[] }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [today] = useState(() => new Date());
  const date = useShortDateFormat(today);
  const restore = useRestoreNote();
  const [unfolded, setUnfolded] = useState(false);
  const refusal = restore.isError ? noteRefusal(restore.error) : undefined;
  return (
    <View style={{ gap: spacing.sm }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bite.notebook.past', { count: notes.length })}
        accessibilityState={{ expanded: unfolded }}
        onPress={() => setUnfolded(!unfolded)}
        style={[styles.row, { gap: spacing.xs + 2, paddingLeft: spacing.xs, minHeight: 44 }]}
      >
        <Icon name="archive" size={15} color="textMuted" />
        <Text variant="captionStrong" color="textMuted" style={styles.flex}>
          {t('bite.notebook.past', { count: notes.length }).toLocaleUpperCase()}
        </Text>
        <Icon name={unfolded ? 'up' : 'down'} size={15} color="textMuted" />
      </Pressable>
      {unfolded ? (
        <>
          <Card list>
            {notes.map((note, index) => (
              <View
                key={note.id}
                style={[
                  styles.row,
                  listDivider(index === 0, colors.border),
                  { gap: spacing.sm, paddingVertical: spacing.md },
                ]}
              >
                <View style={[styles.flex, { gap: 2 }]}>
                  <Text variant="bodyStrong" color="textMuted">
                    {note.text}
                  </Text>
                  <Text variant="caption" color="textMuted">
                    {t('bite.notebook.archived', {
                      when: date(note.archivedAt!),
                      reason: note.archiveReason,
                    })}
                  </Text>
                </View>
                <TopBarButton
                  icon="undo"
                  label={t('bite.notebook.restore')}
                  onPress={() => restore.mutate(note.id)}
                />
              </View>
            ))}
          </Card>
          {refusal ? (
            <Text color="danger">{t(`bite.notebook.refusals.${refusal}`)}</Text>
          ) : restore.isError ? (
            <Text color="danger">{t('bite.notebook.notRestored')}</Text>
          ) : null}
          <Text variant="caption" color="textMuted">
            {t('bite.notebook.pastNote')}
          </Text>
        </>
      ) : null}
    </View>
  );
}

/** No note yet: Bite, happy, and a way to add one (board 25). */
function EmptyNotebook({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.empty, { gap: spacing.md, padding: spacing.xxl }]}>
      <BiteAvatar size={96} expression="happy" />
      <Text variant="headline" align="center">
        {t('bite.notebook.emptyTitle')}
      </Text>
      <Text color="textMuted" align="center">
        {t('bite.notebook.emptyBody')}
      </Text>
      <Button label={t('bite.notebook.addNote')} onPress={onAdd} />
    </View>
  );
}

type NoteSheetProps = {
  note: Note;
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
};

/**
 * A note opened (board 21): its category and text, the chat it came from, to open, when Bite asks
 * again, and Edit and Remove.
 */
function NoteSheet({ note, onClose, onEdit, onRemove }: NoteSheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const source = useSourceLine();
  const clock = useClockFormat();
  const reviewDay = useReviewDay();
  const fromChat = note.source === 'chat' && note.threadId !== null;
  return (
    <Sheet onClose={onClose}>
      <View
        style={[
          styles.tag,
          {
            gap: spacing.xs,
            paddingHorizontal: spacing.sm + 2,
            paddingVertical: spacing.xs,
            borderRadius: radii.md,
            backgroundColor: colors.primaryWash,
          },
        ]}
      >
        <Icon name={CATEGORY_ICONS[note.category]} size={15} color="primaryText" />
        <Text variant="captionStrong" color="primaryText">
          {t(`bite.notebook.categories.${note.category}`)}
        </Text>
      </View>
      <Text variant="headline">{note.text}</Text>
      <View style={{ backgroundColor: colors.surface, borderRadius: radii.md }}>
        <View style={[styles.row, { gap: spacing.md, padding: spacing.md }]}>
          <Icon
            name={fromChat ? 'chat' : note.source === 'user' ? 'person' : 'star'}
            size={20}
            color="textMuted"
          />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{source(note)}</Text>
            {fromChat ? (
              <Text variant="caption" color="textMuted">
                {clock(note.createdAt)}
              </Text>
            ) : null}
          </View>
          {fromChat ? (
            <Button
              label={t('bite.notebook.open')}
              variant="ghost"
              size="small"
              onPress={() => {
                onClose();
                openNoteChat(note.threadId!);
              }}
            />
          ) : null}
        </View>
        {note.reviewOn ? (
          <View
            style={[
              styles.row,
              listDivider(false, colors.border),
              { gap: spacing.md, padding: spacing.md },
            ]}
          >
            <Icon name="timer" size={20} color="textMuted" />
            <View style={styles.flex}>
              <Text variant="bodyStrong">
                {t('bite.notebook.asksAgain', { day: reviewDay(note.reviewOn) })}
              </Text>
              <Text variant="caption" color="textMuted">
                {t('bite.notebook.asksAgainNote')}
              </Text>
            </View>
          </View>
        ) : null}
      </View>
      <View style={[styles.row, { gap: spacing.md }]}>
        <SheetAction icon="edit" label={t('bite.notebook.edit')} onPress={onEdit} />
        <SheetAction icon="trash" label={t('bite.notebook.remove')} onPress={onRemove} danger />
      </View>
    </Sheet>
  );
}

/** Edit or Remove under a note, side by side, Remove in red (board 21). */
function SheetAction({
  icon,
  label,
  onPress,
  danger = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors, radii, spacing } = useTheme();
  const color = danger ? 'danger' : 'text';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.flex,
        styles.row,
        styles.center,
        {
          gap: spacing.sm,
          minHeight: 48,
          borderWidth: 1,
          borderRadius: radii.md,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.selected : colors.surface,
        },
      ]}
    >
      <Icon name={icon} size={18} color={color} />
      <Text variant="label" color={color}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A new note, or one to change (board 22): its category and its text. */
function EditSheet({ note, onClose }: { note?: Note; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const field = useFieldStyle();
  const save = useSaveNote();
  const [category, setCategory] = useState<NoteCategory>(note?.category ?? 'allergy');
  const [text, setText] = useState(note?.text ?? '');
  const refusal = save.isError ? noteRefusal(save.error) : undefined;
  const submit = () => {
    if (save.isPending || !text.trim()) return;
    save.mutate({ id: note?.id, category, text }, { onSuccess: onClose });
  };
  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {t(note ? 'bite.notebook.editTitle' : 'bite.notebook.addTitle')}
      </Text>
      <View style={[styles.chips, { gap: spacing.sm }]}>
        {NOTE_CATEGORIES.map((option) => (
          <Chip
            key={option}
            label={t(`bite.notebook.categories.${option}`)}
            selected={option === category}
            onPress={() => setCategory(option)}
          />
        ))}
      </View>
      <View style={{ gap: spacing.sm }}>
        <FieldLabel text={t('bite.notebook.note')} />
        <TextInput
          accessibilityLabel={t('bite.notebook.note')}
          value={text}
          onChangeText={setText}
          editable={!save.isPending}
          maxLength={MAX_NOTE_LENGTH}
          multiline
          autoFocus
          placeholder={t('bite.notebook.placeholder')}
          placeholderTextColor={colors.placeholder}
          style={field}
        />
      </View>
      {refusal ? (
        <Text color="danger">{t(`bite.notebook.refusals.${refusal}`)}</Text>
      ) : save.isError ? (
        <Text color="danger">{t('bite.notebook.notSaved')}</Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Button
          label={t('bite.notebook.cancel')}
          variant="secondary"
          onPress={onClose}
          style={styles.flex}
        />
        <Button
          label={t('bite.notebook.save')}
          loading={save.isPending}
          disabled={!text.trim()}
          onPress={submit}
          style={styles.flex}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    justifyContent: 'center',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 3,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
