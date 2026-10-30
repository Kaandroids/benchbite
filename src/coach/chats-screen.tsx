import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, SectionList, StyleSheet, TextInput, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
import { listDivider } from '@/components/ui/card';
import { useFieldStyle } from '@/components/ui/field';
import { Icon } from '@/components/ui/icon';
import { Screen } from '@/components/ui/screen';
import { SearchField } from '@/components/ui/search-field';
import { afterSheetCloses, Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { Toast } from '@/components/ui/toast';
import {
  isoWeekday,
  useClockFormat,
  useMonthYearFormat,
  useShortDateFormat,
  useWeekdayFormat,
} from '@/i18n/dates';
import { useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { type ChatsParams, openChat } from './bite-route';
import { groupThreads, timeKind, type ThreadGroup } from './thread-groups';
import {
  MAX_THREAD_TITLE_LENGTH,
  threadTitle,
  useDeleteThread,
  useRenameThread,
  useThreads,
  type ThreadSummary,
} from './threads';
import { useDeferredDelete } from './use-deferred-delete';

/** How long typing rests before the search runs. */
const SEARCH_DELAY_MS = 250;

/** A section of the history as the list draws it: its heading and its chats. */
type Section = { group: ThreadGroup; data: ThreadSummary[] };

/**
 * Bite's chat history (#295, ADR 0055): the user's chats, latest first, by day and month, found by
 * a word. A long press renames or deletes one; a delete can be undone while its note shows.
 */
export function ChatsScreen() {
  const { t } = useTranslation();
  const { current } = useLocalSearchParams<ChatsParams>();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const threads = useThreads(term);
  const deleteThread = useDeleteThread();
  const { deleting, remove, undo, settle } = useDeferredDelete<ThreadSummary>(deleteThread.mutate);
  const [options, setOptions] = useState<ThreadSummary | null>(null);
  const [renaming, setRenaming] = useState<ThreadSummary | null>(null);
  const [today] = useState(() => new Date());
  const month = useMonthYearFormat(today);

  // The search runs once typing rests, not on every letter.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Only before anything loaded does the screen wait; a new search keeps the last list meanwhile.
  if (threads.data === undefined) {
    return (
      <Screen onBack={() => router.back()} title={t('bite.chats.title')}>
        <LoadState queries={[threads]} />
      </Screen>
    );
  }

  const shown = threads.data.filter((thread) => thread.id !== deleting?.id);
  const sections: Section[] = groupThreads(shown, today).map((group) => ({
    group,
    data: group.threads,
  }));

  return (
    <Screen onBack={() => router.back()} title={t('bite.chats.title')} scrolls={false}>
      {shown.length === 0 && search.trim() === '' && term === '' ? (
        <EmptyChats />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(thread) => String(thread.id)}
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm }}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={
            <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
              <SearchField
                label={t('bite.chats.search')}
                value={search}
                onChangeText={setSearch}
                maxLength={80}
              />
              <Button label={t('bite.chats.new')} onPress={() => openChat()} />
            </View>
          }
          ListEmptyComponent={
            <Text color="textMuted" align="center">
              {t('bite.chats.noneFound')}
            </Text>
          }
          renderSectionHeader={({ section }) => (
            <Text
              variant="label"
              color="textMuted"
              accessibilityRole="header"
              style={{ paddingTop: spacing.lg, paddingBottom: spacing.xs }}
            >
              {section.group.kind === 'month'
                ? month(section.group.month)
                : t(`bite.chats.groups.${section.group.kind}`)}
            </Text>
          )}
          renderItem={({ item, index, section }) => (
            <ThreadRow
              thread={item}
              today={today}
              first={index === 0}
              last={index === section.data.length - 1}
              onOpen={() => openChat(item.id, current)}
              onOptions={() => setOptions(item)}
            />
          )}
          onEndReached={() => {
            if (threads.hasNextPage && !threads.isFetchingNextPage) void threads.fetchNextPage();
          }}
        />
      )}
      {deleteThread.isError ? (
        <Text color="danger" align="center">
          {t('bite.chats.notDeleted')}
        </Text>
      ) : null}
      {deleting ? (
        <Toast
          key={deleting.id}
          message={t('bite.chats.deleted')}
          action={{ label: t('bite.chats.undo'), onPress: undo }}
          onHide={settle}
        />
      ) : null}
      {options ? (
        <OptionsSheet
          thread={options}
          onClose={() => setOptions(null)}
          onRename={() => {
            setOptions(null);
            afterSheetCloses(() => setRenaming(options));
          }}
          onDelete={() => {
            setOptions(null);
            remove(options);
          }}
        />
      ) : null}
      {renaming ? <RenameSheet thread={renaming} onClose={() => setRenaming(null)} /> : null}
    </Screen>
  );
}

type ThreadRowProps = {
  thread: ThreadSummary;
  today: Date;
  /** The first and last chat of its section, which round the section's card. */
  first: boolean;
  last: boolean;
  onOpen: () => void;
  onOptions: () => void;
};

/** A chat: Bite's last face, its name, when its last message came, and the start of it. */
function ThreadRow({ thread, today, first, last, onOpen, onOptions }: ThreadRowProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const clock = useClockFormat();
  const weekday = useWeekdayFormat('short');
  const date = useShortDateFormat(today);
  const kind = timeKind(thread, today);
  const time =
    kind === 'clock'
      ? clock(thread.lastMessageAt)
      : kind === 'weekday'
        ? weekday(isoWeekday(thread.lastMessageAt))
        : date(thread.lastMessageAt);
  const title = thread.title ?? t('bite.chats.untitled');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${time}${thread.lastMessage ? `, ${thread.lastMessage}` : ''}`}
      accessibilityHint={t('bite.chats.optionsHint')}
      onPress={onOpen}
      onLongPress={onOptions}
      style={({ pressed }) => [
        styles.row,
        // A section's chats as one card, as Card list draws one, each but the first divided.
        {
          gap: spacing.md,
          padding: spacing.md,
          backgroundColor: pressed ? colors.selected : colors.surface,
          borderColor: colors.border,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderBottomWidth: last ? 1 : 0,
          ...(first ? { borderTopWidth: 1 } : listDivider(false, colors.border)),
          borderTopLeftRadius: first ? radii.lg : 0,
          borderTopRightRadius: first ? radii.lg : 0,
          borderBottomLeftRadius: last ? radii.lg : 0,
          borderBottomRightRadius: last ? radii.lg : 0,
        },
      ]}
    >
      <BiteAvatar size={40} expression={thread.expression ?? 'neutral'} />
      <View style={styles.text}>
        <View style={[styles.titleLine, { gap: spacing.sm }]}>
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {title}
          </Text>
          <Text variant="caption" color="textMuted">
            {time}
          </Text>
        </View>
        {thread.lastMessage ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {thread.lastMessage}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** No chat yet: Bite, surprised, and a way to start one. */
function EmptyChats() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.empty, { gap: spacing.md, padding: spacing.xxl }]}>
      <BiteAvatar size={96} expression="surprised" />
      <Text variant="headline" align="center">
        {t('bite.chats.emptyTitle')}
      </Text>
      <Text color="textMuted" align="center">
        {t('bite.chats.emptyBody')}
      </Text>
      <Button label={t('bite.chats.start')} onPress={() => openChat()} />
    </View>
  );
}

type OptionsSheetProps = {
  thread: ThreadSummary;
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
};

/** What can be done with a chat: rename it, or delete it, and what deleting keeps. */
function OptionsSheet({ thread, onClose, onRename, onDelete }: OptionsSheetProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const option = (icon: 'edit' | 'trash', label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.option,
        {
          gap: spacing.md,
          padding: spacing.md,
          borderRadius: radii.md,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Icon name={icon} color={icon === 'trash' ? 'danger' : 'text'} />
      <Text variant="bodyStrong" color={icon === 'trash' ? 'danger' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <Sheet onClose={onClose}>
      <View style={[styles.row, { gap: spacing.md }]}>
        <BiteAvatar size={40} expression={thread.expression ?? 'neutral'} />
        <Text variant="headline" numberOfLines={1} style={styles.flex}>
          {thread.title ?? t('bite.chats.untitled')}
        </Text>
      </View>
      <View style={{ gap: spacing.sm }}>
        {option('edit', t('bite.chats.rename'), onRename)}
        {option('trash', t('bite.chats.delete'), onDelete)}
      </View>
      <Text variant="caption" color="textMuted">
        {t('bite.chats.deleteNote')}
      </Text>
    </Sheet>
  );
}

/** A new name for a chat; an empty one clears it. */
function RenameSheet({ thread, onClose }: { thread: ThreadSummary; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const field = useFieldStyle();
  const rename = useRenameThread();
  const [text, setText] = useState(thread.title ?? '');
  const save = () => {
    if (rename.isPending) return;
    if (threadTitle(text) === thread.title) {
      onClose();
      return;
    }
    rename.mutate({ id: thread.id, title: text }, { onSuccess: onClose });
  };
  return (
    <Sheet onClose={onClose}>
      <Text variant="headline" accessibilityRole="header">
        {t('bite.chats.renameTitle')}
      </Text>
      <TextInput
        accessibilityLabel={t('bite.chats.name')}
        value={text}
        onChangeText={setText}
        onSubmitEditing={save}
        editable={!rename.isPending}
        maxLength={MAX_THREAD_TITLE_LENGTH}
        returnKeyType="done"
        autoFocus
        placeholder={t('bite.chats.untitled')}
        placeholderTextColor={colors.placeholder}
        style={field}
      />
      {rename.isError ? <Text color="danger">{t('bite.chats.notRenamed')}</Text> : null}
      <View style={[styles.row, { gap: spacing.md }]}>
        <Button
          label={t('bite.chats.cancel')}
          variant="secondary"
          onPress={onClose}
          style={styles.flex}
        />
        <Button
          label={t('bite.chats.save')}
          loading={rename.isPending}
          onPress={save}
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
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
