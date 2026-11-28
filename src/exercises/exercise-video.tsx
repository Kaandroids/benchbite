import { useEvent } from 'expo';
import { useFocusEffect } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/theme';

import type { ExerciseVideo as Video } from './video';

/**
 * How an exercise goes (ADR 0176): its video, muted and looping, in place of the muscle map. It
 * plays while the screen is in front, from the phone's cache after the first time, and a tap
 * pauses or plays it. Its poster shows until the first frame, and with Reduce Motion on it waits
 * for a tap. `onError` tells the screen to show the map instead.
 */
export function ExerciseVideo({ video, onError }: { video: Video; onError: () => void }) {
  const { t } = useTranslation();
  const { colors, radii } = useTheme();
  const reduceMotion = useReducedMotion();
  const player = useVideoPlayer({ uri: video.video, useCaching: true }, (created) => {
    created.loop = true;
    created.muted = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [firstFrame, setFirstFrame] = useState(false);
  // Paused by a tap, which leaving and coming back keeps; Reduce Motion starts paused.
  const [paused, setPaused] = useState(reduceMotion);
  // The same, for the focus effect, which a tap should not run again.
  const pausedRef = useRef(paused);

  useEffect(() => {
    if (status === 'error') {
      onError();
    }
  }, [status, onError]);

  // Plays only while the screen is in front, so it never runs behind another screen.
  useFocusEffect(
    useCallback(() => {
      if (!pausedRef.current) {
        player.play();
      }
      return () => player.pause();
    }, [player]),
  );

  const toggle = () => {
    if (isPlaying) {
      player.pause();
      pausedRef.current = true;
      setPaused(true);
    } else {
      player.play();
      pausedRef.current = false;
      setPaused(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('exercise.video')}
      accessibilityHint={isPlaying ? t('exercise.pauseVideo') : t('exercise.playVideo')}
      onPress={toggle}
      style={[
        styles.frame,
        { borderRadius: radii.lg, borderColor: colors.border, backgroundColor: colors.track },
      ]}
    >
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setFirstFrame(true)}
      />
      {firstFrame ? null : (
        <Image
          testID="video-poster"
          source={{ uri: video.poster }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
      {!firstFrame && !paused ? (
        <ActivityIndicator style={styles.spinner} size="small" color={colors.textMuted} />
      ) : null}
      {isPlaying || (!paused && !firstFrame) ? null : (
        <View style={styles.center} pointerEvents="none">
          <View style={[styles.play, { backgroundColor: colors.surface }]}>
            <Icon name="play" size={20} color="text" />
          </View>
        </View>
      )}
    </Pressable>
  );
}

const PLAY_SIZE = 48;

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderWidth: 1,
    overflow: 'hidden',
  },
  spinner: {
    position: 'absolute',
    right: 10,
    bottom: 10,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: {
    width: PLAY_SIZE,
    height: PLAY_SIZE,
    borderRadius: PLAY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
});
