import { router } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LoadState } from '@/components/load-state';
import { Button } from '@/components/ui/button';
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
import { groupThreads, timeKind, type ThreadGroup } from './thread-groups';
import {
  MAX_THREAD_TITLE_LENGTH,
  useDeleteThread,
  useRenameThread,
  useThreads,
  type ThreadSummary,
} from './threads';

/** Opens the chat: a thread of the history, or, without one, a new chat. */
function openChat(thread?: number) {
  // A new chat's key is new each time, so that it starts empty even over one that was open.
  router.dismissTo({ pathname: '/bite', params: { thread: thread ?? `new-${Date.now()}` } });
}

/**
 * Bite's chat history (#295, ADR 0055): the user's chats, latest first, by day and month, found by
 * a word. A long press renames or deletes one; a delete can be undone while its note shows.
 */
export function ChatsScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [search, setSearch] = useState('');
  const threads = useThreads(search);
  const deleteThread = useDeleteThread();
  const [options, setOptions] = useState<ThreadSummary | null>(null);
  const [renaming, setRenaming] = useState<ThreadSummary | null>(null);
  // Gone from the list at once, and deleted once its Undo has gone.
  const [deleting, setDeleting] = useState<ThreadSummary | null>(null);
  const [today] = useState(() => new Date());

  // Whether the delete showing was undone; the toast hides after its Undo too.
  const undone = useRef(false);

  const remove = (thread: ThreadSummary) => {
    // One Undo at a time: a delete still waiting goes through first.
    if (deleting && !undone.current) deleteThread.mutate(deleting.id);
    undone.current = false;
    setDeleting(thread);
  };
  const { mutate: deleteNow } = deleteThread;
  const hideToast = useCallback(() => {
    if (deleting && !undone.current) deleteNow(deleting.id);
    undone.current = false;
    setDeleting(null);
  }, [deleting, deleteNow]);

  const shown = (threads.data ?? []).filter((thread) => thread.id !== deleting?.id);
  const groups = groupThreads(shown, today);
  const searching = search.trim() !== '';

  if (threads.data === undefined) {
    return (
      <Screen onBack={() => router.back()} title={t('bite.chats.title')}>
        <LoadState queries={[threads]} />
      </Screen>
    );
  }

  return (
    <Screen onBack={() => router.back()} title={t('bite.chats.title')} scrolls={false}>
      {shown.length === 0 && !searching ? (
        <EmptyChats />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(group) =>
            group.kind === 'month' ? `month-${group.month.getTime()}` : group.kind
          }
          contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg }}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ gap: spacing.md }}>
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
          renderItem={({ item }) => (
            <Group group={item} today={today} onOpen={openChat} onOptions={setOptions} />
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
          action={{ label: t('bite.chats.undo'), onPress: () => (undone.current = true) }}
          onHide={hideToast}
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

type GroupProps = {
  group: ThreadGroup;
  today: Date;
  onOpen: (thread: number) => void;
  onOptions: (thread: ThreadSummary) => void;
};

/** A section of the history, with its heading and its chats on a card. */
function Group({ group, today, onOpen, onOptions }: GroupProps) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const month = useMonthYearFormat(today);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" color="textMuted" accessibilityRole="header">
        {group.kind === 'month' ? month(group.month) : t(`bite.chats.groups.${group.kind}`)}
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radii.lg,
          overflow: 'hidden',
        }}
      >
        {group.threads.map((thread, index) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            today={today}
            divided={index > 0}
            onOpen={() => onOpen(thread.id)}
            onOptions={() => onOptions(thread)}
          />
        ))}
      </View>
    </View>
  );
}

type ThreadRowProps = {
  thread: ThreadSummary;
  today: Date;
  divided: boolean;
  onOpen: () => void;
  onOptions: () => void;
};

/** A chat: Bite's last face, its name, when its last message came, and the start of it. */
function ThreadRow({ thread, today, divided, onOpen, onOptions }: ThreadRowProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
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
        {
          gap: spacing.md,
          padding: spacing.md,
          borderTopColor: colors.border,
          borderTopWidth: divided ? StyleSheet.hairlineWidth : 0,
          backgroundColor: pressed ? colors.selected : undefined,
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
    if (text.trim() === (thread.title ?? '')) {
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
