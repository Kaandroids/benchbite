// A stand-in for expo-audio in tests, which has no native module there: a recorder and a player
// that do nothing, whose state each test sets through `fakeAudio`.

export const AudioQuality = { MIN: 0, LOW: 32, MEDIUM: 64, HIGH: 96, MAX: 127 } as const;
export const IOSOutputFormat = { MPEG4AAC: 'aac ' } as const;

const recorderState = () => ({
  isRecording: false,
  canRecord: true,
  durationMillis: 0,
  metering: -30,
  url: null,
});
const playerStatus = () => ({
  isLoaded: true,
  playing: false,
  currentTime: 0,
  duration: 0,
  didJustFinish: false,
});

export const fakeAudio = {
  permission: { granted: true, status: 'granted', canAskAgain: true, expires: 'never' },
  recorder: {
    uri: 'file:///cache/voice.m4a' as string | null,
    prepareToRecordAsync: jest.fn(() => Promise.resolve()),
    record: jest.fn(),
    stop: jest.fn(() => Promise.resolve()),
  },
  recorderState: recorderState(),
  player: {
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(() => Promise.resolve()),
  },
  playerStatus: playerStatus(),
  /** Puts everything back as it was before a test. */
  reset() {
    fakeAudio.permission = { ...fakeAudio.permission, granted: true, status: 'granted' };
    fakeAudio.recorder.uri = 'file:///cache/voice.m4a';
    fakeAudio.recorderState = recorderState();
    fakeAudio.playerStatus = playerStatus();
  },
};

export const getRecordingPermissionsAsync = jest.fn(() => Promise.resolve(fakeAudio.permission));
export const requestRecordingPermissionsAsync = jest.fn(() =>
  Promise.resolve(fakeAudio.permission),
);
export const setAudioModeAsync = jest.fn(() => Promise.resolve());
export const useAudioRecorder = () => fakeAudio.recorder;
export const useAudioRecorderState = () => fakeAudio.recorderState;
export const useAudioPlayer = () => fakeAudio.player;
export const useAudioPlayerStatus = () => fakeAudio.playerStatus;
