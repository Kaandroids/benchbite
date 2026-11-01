import { Fragment, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { COACH_TOOLS } from '@shared/coach/chat';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { sameDay } from '@/i18n/dates';
import { oneOf } from '@/lib/one-of';
import { radii, useTheme } from '@/theme';

import { BiteAvatar } from './bite-avatar';
import { openNotebook } from './bite-route';
import { type MessagePhoto, photoDataUri } from './chat-photos';
import { MealCardView } from './meal-card';
import type { MealCardState } from './meal-cards';
import { type NoteCard, shownNotes } from './notes';
import { PhotoViewer } from './photo-viewer';
import { ProposalCard } from './proposal-card';
import type { ProposalState } from './proposals';
import { canSendAgain, type ChatMessage, type ChatStatus } from './use-chat';
import { useMomentFormat } from './use-moment-format';

/** Bite's face beside its messages. */
const AVATAR = 32;
type Spacing = ReturnType<typeof useTheme>['spacing'];
/** The room between Bite's face and its message. */
const avatarGap = (spacing: Spacing) => spacing.md - 2;
/** Where Bite's messages begin, past its face, as what goes under them does. */
const pastAvatar = (spacing: Spacing) => AVATAR + avatarGap(spacing);

type ChatMessagesProps = {
  messages: ChatMessage[];
  status: ChatStatus;
  /** The tool Bite is looking something up with. */
  tool?: string;
  /** Asks an unanswered question again; without it, as when the user may not ask, it is not offered. */
  onAskAgain?: (question: ChatMessage) => void;
  /** Where Bite's cards stand. */
  cards: CardStates;
  /** The addresses of the chat's kept photos, by path, once read. */
  photoUrls?: Map<string, string>;
};

/** Where the cards of each kind stand, by id, once loaded, and whether that is loading. */
export type CardStates = {
  proposals?: Map<number, ProposalState>;
  mealCards?: Map<number, MealCardState>;
  loading: { proposals: boolean; mealCards: boolean };
};

/**
 * The conversation: the user's messages in bubbles, their photos above them, Bite's as text after
 * its face, with the meals it estimated and the changes it proposed under it. Bite's last message thinks while it waits, with
 * what it is looking up or at, and talks while its text comes (boards 2, 3 and 8). A photo opens
 * large when tapped.
 */
export function ChatMessages({
  messages,
  status,
  tool,
  onAskAgain,
  cards,
  photoUrls,
}: ChatMessagesProps) {
  const { spacing } = useTheme();
  const [viewing, setViewing] = useState<string>();
  const moment = useMomentFormat();
  // Bite thinks on under a card it gave before a word.
  const proposing = hasCards(messages.at(-1));
  // A conversation over more than one day shows when each day of it began (board 18).
  const first = messages[0]?.createdAt;
  const days =
    first !== undefined && messages.some((m) => m.createdAt && !sameDay(m.createdAt, first));
  return (
    <View style={{ gap: spacing.lg }}>
      {messages.map((message, index) => {
        const before = messages[index - 1]?.createdAt;
        const startsDay =
          days &&
          message.createdAt !== undefined &&
          (!before || !sameDay(before, message.createdAt));
        return (
          <Fragment key={message.id}>
            {startsDay ? (
              <Text variant="caption" color="textMuted" align="center" accessibilityRole="header">
                {moment(message.createdAt!)}
              </Text>
            ) : null}
            <MessageRow
              message={message}
              before={messages[index - 1]}
              last={index === messages.length - 1}
              status={status}
              tool={tool}
              onAskAgain={onAskAgain}
              cards={cards}
              photoUrls={photoUrls}
              onOpenPhoto={setViewing}
            />
          </Fragment>
        );
      })}
      {/* A lookup after Bite started writing, or proposed, shows under what it wrote. */}
      {(status === 'answering' && tool) || (status === 'thinking' && proposing) ? (
        <ToolLine tool={tool} indent />
      ) : null}
      {viewing ? <PhotoViewer uri={viewing} onClose={() => setViewing(undefined)} /> : null}
    </View>
  );
}

/** Whether Bite gave cards with a message: changes it proposed, meals it estimated, or notes. */
function hasCards(message: ChatMessage | undefined): boolean {
  return !!message?.proposals?.length || !!message?.mealCards?.length || !!message?.notes?.length;
}

type MessageRowProps = Pick<
  ChatMessagesProps,
  'status' | 'tool' | 'onAskAgain' | 'cards' | 'photoUrls'
> & {
  message: ChatMessage;
  /** The message before, the question Bite's last one answers. */
  before?: ChatMessage;
  last: boolean;
  onOpenPhoto: (uri: string) => void;
};

/** A message: the user's, Bite's, or Bite's last one thinking while it waits. */
function MessageRow({
  message,
  before,
  last,
  status,
  tool,
  onAskAgain,
  cards,
  photoUrls,
  onOpenPhoto,
}: MessageRowProps) {
  if (message.role === 'user') {
    return (
      <UserMessage
        message={message}
        onAskAgain={onAskAgain}
        // Only a message with photos kept gets their addresses, so the others do not render again.
        photoUrls={message.photos?.some((photo) => photo.path) ? photoUrls : undefined}
        onOpenPhoto={onOpenPhoto}
      />
    );
  }
  if (last && status === 'thinking' && !message.text && !hasCards(message)) {
    return <Thinking tool={tool} photos={before?.photos?.length ?? 0} />;
  }
  // Only a message with cards gets where they stand, so that the others render again only when
  // they change, not when a card is decided.
  return (
    <BiteMessage
      message={message}
      talking={last && status !== 'idle'}
      cards={hasCards(message) ? cards : undefined}
    />
  );
}

// Each message renders again only when it changes, as only the last one does while Bite writes.
const UserMessage = memo(function UserMessage({
  message,
  onAskAgain,
  photoUrls,
  onOpenPhoto,
}: {
  message: ChatMessage;
  onAskAgain?: (question: ChatMessage) => void;
  photoUrls?: Map<string, string>;
  onOpenPhoto: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  // A question with photos kept is asked again only with them, which only the chat has.
  const askAgain = onAskAgain && canSendAgain(message) ? onAskAgain : undefined;
  return (
    <View style={[styles.user, { gap: spacing.xs }]}>
      {message.photos?.length ? (
        <MessagePhotos photos={message.photos} urls={photoUrls} onOpen={onOpenPhoto} />
      ) : null}
      {/* A message may be photos alone. */}
      {message.text ? (
        <View
          style={[
            styles.bubble,
            {
              backgroundColor: colors.userBubble,
              paddingHorizontal: spacing.md + 2,
              paddingVertical: spacing.sm + 2,
            },
          ]}
        >
          <Text>{message.text}</Text>
        </View>
      ) : null}
      {message.unanswered ? (
        <View style={[styles.row, { gap: spacing.xs }]}>
          <Text variant="caption" color="textMuted">
            {t('bite.unanswered')}
          </Text>
          {askAgain ? (
            <>
              <Text variant="caption" color="textMuted" aria-hidden>
                ·
              </Text>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => askAgain(message)}>
                <Text variant="captionStrong" color="primaryText">
                  {t('bite.askAgain')}
                </Text>
              </Pressable>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const BiteMessage = memo(function BiteMessage({
  message,
  talking,
  cards,
}: {
  message: ChatMessage;
  talking: boolean;
  /** Where its cards stand, for a message with cards. */
  cards?: CardStates;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const expression = message.expression ?? 'neutral';
  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.bite, { gap: avatarGap(spacing) }]}>
        {talking ? (
          <BiteAvatar size={AVATAR} expression={expression} state="talking" />
        ) : (
          <BiteAvatar size={AVATAR} expression={expression} />
        )}
        <View style={[styles.biteColumn, { gap: spacing.sm + 2 }]}>
          {/* A card may come without a word. */}
          {message.text ? (
            <View
              style={[
                styles.biteBubble,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  paddingHorizontal: spacing.md + 2,
                  paddingVertical: spacing.sm + 2,
                },
              ]}
            >
              <Text>{message.text}</Text>
            </View>
          ) : null}
          {message.mealCards?.map((card) => {
            const state = cards?.mealCards?.get(card.id);
            return (
              <View key={`meal-${card.id}`} style={styles.proposal}>
                <MealCardView
                  card={card}
                  state={state}
                  waiting={state === undefined && !!cards?.loading.mealCards}
                />
              </View>
            );
          })}
          {message.proposals?.map((card) => {
            const state = cards?.proposals?.get(card.id);
            return (
              <View key={card.id} style={styles.proposal}>
                <ProposalCard
                  card={card}
                  state={state}
                  waiting={state === undefined && !!cards?.loading.proposals}
                />
              </View>
            );
          })}
          {shownNotes(message.notes).map((note) => (
            <NoteLine key={`note-${note.id}-${note.action}`} note={note} />
          ))}
        </View>
      </View>
      {/* An answer that stopped short says so, under it. */}
      {message.cut ? (
        <Text variant="caption" color="textMuted" style={{ marginLeft: pastAvatar(spacing) }}>
          {t(message.cut === 'stopped' ? 'bite.stopped' : 'bite.cutOff')}
        </Text>
      ) : null}
    </View>
  );
});

/** A photo of a message alone, and each of more than one. */
const PHOTO = 92;
const PHOTO_SMALL = 64;

/**
 * The photos of the user's message, above its text: from the device as it is sent, and from the
 * chat's kept photos once it is opened again, a quiet tile until each address is read.
 */
function MessagePhotos({
  photos,
  urls,
  onOpen,
}: {
  photos: MessagePhoto[];
  urls?: Map<string, string>;
  onOpen: (uri: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const size = photos.length === 1 ? PHOTO : PHOTO_SMALL;
  return (
    <View style={styles.photos}>
      {photos.map((photo, index) => {
        const uri = photo.data !== undefined ? photoDataUri(photo.data) : urls?.get(photo.path);
        const label = t('bite.photos.photo', { number: index + 1 });
        return (
          <Pressable
            key={photo.path ?? index}
            accessibilityRole="imagebutton"
            accessibilityLabel={label}
            disabled={!uri}
            onPress={() => uri && onOpen(uri)}
            style={[
              styles.photo,
              {
                width: size,
                height: size,
                borderRadius: size === PHOTO ? radii.lg - 2 : radii.md,
                backgroundColor: colors.track,
              },
            ]}
          >
            {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Thinking({ tool, photos }: { tool?: string; photos: number }) {
  const { spacing } = useTheme();
  return (
    <View style={[styles.row, { gap: avatarGap(spacing) }]}>
      <BiteAvatar size={AVATAR} state="thinking" />
      <ToolLine tool={tool} photos={photos} />
    </View>
  );
}

/**
 * Bite's dots, and what it looks up, if it says, or else at the `photos` sent with the question;
 * `indent` lines it up with Bite's messages.
 */
function ToolLine({
  tool,
  photos = 0,
  indent = false,
}: {
  tool?: string;
  photos?: number;
  indent?: boolean;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const known = oneOf(COACH_TOOLS, tool);
  const line = known
    ? t(`bite.tools.${known}`)
    : photos > 0
      ? t('bite.photos.looking', { count: photos })
      : undefined;
  return (
    <View
      style={[
        styles.row,
        styles.flex,
        { gap: avatarGap(spacing), marginLeft: indent ? pastAvatar(spacing) : 0 },
      ]}
      accessible
      accessibilityLabel={line ?? t('bite.thinking')}
      accessibilityLiveRegion="polite"
    >
      <Dots />
      {line ? (
        <Text variant="captionStrong" color="textMuted" style={styles.flex}>
          {line}
        </Text>
      ) : null}
    </View>
  );
}

/** Three dots that light up one after another while Bite thinks. */
function Dots() {
  const { colors } = useTheme();
  return (
    <View style={styles.dots} aria-hidden>
      {[0, 1, 2].map((index) => (
        <Dot key={index} delay={index * 200} color={colors.textMuted} />
      ))}
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(reduceMotion ? 0.6 : 0.25);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 600 }), withTiming(0.25, { duration: 600 })),
        -1,
      ),
    );
  }, [delay, opacity, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

/** The sharper corner of a message, toward who said it. */
const TAIL = 6;

const styles = StyleSheet.create({
  user: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: TAIL,
  },
  bite: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  /** Bite's answer and the changes it proposed, beside its face. */
  biteColumn: {
    flex: 1,
    alignItems: 'flex-start',
  },
  /** Bite's answer on a card, its corner by Bite's face sharper, as the user's is by its edge. */
  biteBubble: {
    flexShrink: 1,
    borderWidth: 1,
    borderTopLeftRadius: TAIL,
    borderTopRightRadius: radii.xl,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  proposal: {
    alignSelf: 'stretch',
  },
  noteLine: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  photos: {
    flexDirection: 'row',
    gap: 4,
  },
  photo: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  dots: {
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

/** A note Bite kept, as a line under its answer, with a way to the notebook (board 4). */
function NoteLine({ note }: { note: NoteCard }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={[styles.noteLine, { gap: spacing.xs + 2 }]}>
      <Icon name="notebook" size={14} color="textMuted" />
      <Text variant="caption" color="textMuted" style={styles.flex}>
        {t(`bite.notes.${note.action as Exclude<NoteCard['action'], 'asked'>}`, {
          text: note.text,
        })}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('bite.notes.viewLabel')}
        onPress={openNotebook}
        hitSlop={8}
        style={{ paddingHorizontal: spacing.xs }}
      >
        <Text variant="captionStrong" color="primaryText">
          {t('bite.notes.view')}
        </Text>
      </Pressable>
    </View>
  );
}
