import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import { fireEvent, render, screen } from '@/test/render';

import { useArchiveExercise, useKindLock } from './custom';
import { EditExerciseScreen } from './edit-exercise-screen';
import { ExerciseScreen } from './exercise-screen';
import { useExerciseDetails, type LibraryExercise } from './library';
import { useExerciseVideo } from './video';

jest.mock('./photos', () => ({
  usePictureUrls: (paths: string[]) =>
    Object.fromEntries(paths.map((path) => [path, `https://photos.test/${path}`])),
}));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock('./custom', () => ({ useArchiveExercise: jest.fn(), useKindLock: jest.fn() }));
jest.mock('./library', () => ({
  ...jest.requireActual<typeof import('./library')>('./library'),
  useExerciseDetails: jest.fn(),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./video', () => ({ useExerciseVideo: jest.fn() }));
// The player itself is tested in exercise-video.test.tsx; here it only says it is there, and can fail.
jest.mock('./exercise-video', () => {
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ExerciseVideo: ({ video, onError }: { video: { video: string }; onError: () => void }) => (
      <Pressable accessibilityLabel="The video" onPress={onError}>
        <Text>{video.video}</Text>
      </Pressable>
    ),
  };
});

const ROW: LibraryExercise = {
  id: 'row',
  name: 'Seated cable row',
  searchText: 'seated cable rows',
  metrics: ['weight', 'reps'],
  primaryMuscles: ['middle back'],
  secondaryMuscles: ['biceps', 'lats'],
  equipment: 'cable',
  level: 'beginner',
  category: 'strength',
  imagePaths: [],
  custom: false,
  archived: false,
};

const query = <T,>(data: T | undefined, state: { isError?: boolean } = {}) => ({
  data,
  isPending: data === undefined && !state.isError,
  isError: state.isError ?? false,
  isFetching: false,
  refetch: jest.fn(),
});

function mockDetails(exercises: LibraryExercise[] | undefined, steps: string[] | undefined) {
  jest.mocked(useExerciseDetails).mockReturnValue({
    library: query(exercises),
    instructions: query(steps),
  } as never);
}

const archive = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useExerciseVideo).mockReturnValue(query(null) as never);
  jest.mocked(useArchiveExercise).mockReturnValue({
    mutateAsync: archive.mockResolvedValue(undefined),
    isPending: false,
  } as never);
});

describe('ExerciseScreen', () => {
  it('shows the muscles on the body from the front and the back, the equipment and level', async () => {
    mockDetails([ROW], ['Sit down.', 'Pull.']);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('Seated cable row')).toBeTruthy();
    expect(screen.getByText('Front')).toBeTruthy();
    expect(screen.getByText('Back')).toBeTruthy();
    // The figures are drawn once their tiles know their width.
    await fireEvent(screen.getByLabelText('The muscles from the front'), 'layout', {
      nativeEvent: { layout: { width: 160, height: 160 } },
    });
    expect(
      screen.getByTestId('muscle-map-front-whole', { includeHiddenElements: true }),
    ).toHaveStyle({ width: 142, height: 142 });
    expect(
      screen.getByTestId('muscle-map-back-whole', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Start')).toBeNull();
    expect(screen.getByText('Middle back')).toBeTruthy();
    expect(screen.getByText('Biceps')).toBeTruthy();
    expect(screen.getByText('Cable')).toBeTruthy();
    expect(screen.getByText('Beginner')).toBeTruthy();
  });

  it('lists the steps in order', async () => {
    mockDetails([ROW], ['Sit down.', 'Pull.']);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('How to do it')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Sit down.')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Pull.')).toBeTruthy();
  });

  it("shows the start and end photos of the user's own exercise in place of the body", async () => {
    mockDetails([{ ...ROW, custom: true, imagePaths: ['u/start.jpg', 'u/end.jpg'] }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('Start').props.source).toEqual({
      uri: 'https://photos.test/u/start.jpg',
    });
    expect(screen.getByLabelText('End').props.source).toEqual({
      uri: 'https://photos.test/u/end.jpg',
    });
    expect(screen.queryByText('Front')).toBeNull();
    expect(screen.queryByLabelText('The muscles from the front')).toBeNull();
  });

  it('shows a single photo without captions', async () => {
    mockDetails([{ ...ROW, custom: true, imagePaths: ['u/start.jpg'] }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('Start')).toBeTruthy();
    expect(screen.queryByText('End')).toBeNull();
    expect(screen.queryByText('How to do it')).toBeNull();
  });

  it('names a photo of the end alone as the end', async () => {
    mockDetails([{ ...ROW, custom: true, imagePaths: [null, 'u/end.jpg'] }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('End')).toBeTruthy();
    expect(screen.getByText('End')).toBeTruthy();
    expect(screen.queryByLabelText('Start')).toBeNull();
  });

  it('says when the exercise does not exist, and goes back', async () => {
    mockDetails([ROW], []);
    await render(<ExerciseScreen id="nothing" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(router.back).toHaveBeenCalled();
  });

  it('shows a spinner while loading', async () => {
    mockDetails(undefined, undefined);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it("edits and archives the user's own exercise, and leaves out equipment it has not", async () => {
    mockDetails([{ ...ROW, custom: true, equipment: null, imagePaths: [] }], []);
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons?: AlertButton[]) => {
      buttons?.find((button) => button.text === 'Archive exercise')?.onPress?.();
    });
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByText('Equipment')).toBeNull();
    expect(screen.getByText('Mine')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Edit' }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/workout/exercise/edit',
      params: { id: 'row' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Archive exercise' }));
    expect(archive).toHaveBeenCalledWith(true);
    expect(router.back).toHaveBeenCalled();
  });

  it('brings an archived exercise back, and has no edit for library exercises', async () => {
    mockDetails([{ ...ROW, custom: true, archived: true }], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Bring back' }));
    expect(archive).toHaveBeenCalledWith(false);

    mockDetails([ROW], []);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByRole('button', { name: 'Archive exercise' })).toBeNull();
  });
});

describe('EditExerciseScreen', () => {
  it("says when the exercise is gone or not the user's, rather than loading on", async () => {
    jest.mocked(useKindLock).mockReturnValue(query(null) as never);
    mockDetails([ROW], []);
    await render(<EditExerciseScreen id="gone" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
    await render(<EditExerciseScreen id="row" />);
    expect(screen.getByText('Exercise not found')).toBeTruthy();
  });

  it('neither edits nor archives during a workout, which it would leave', async () => {
    mockDetails([{ ...ROW, custom: true }], []);
    await render(<ExerciseScreen id="row" canEdit={false} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive exercise' })).toBeNull();
  });
  it('shows the video in place of the map, for an exercise that has one', async () => {
    mockDetails([ROW], ['Sit down.']);
    jest.mocked(useExerciseVideo).mockReturnValue(
      query({
        video: 'https://media.test/row.mp4',
        poster: 'https://media.test/row.jpg',
      }) as never,
    );
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('https://media.test/row.mp4')).toBeTruthy();
    expect(screen.queryByText('Front')).toBeNull();
    expect(screen.getByText('How to do it')).toBeTruthy();
  });

  it('shows the map when the video fails to play, or cannot be read', async () => {
    mockDetails([ROW], ['Sit down.']);
    jest.mocked(useExerciseVideo).mockReturnValue(
      query({
        video: 'https://media.test/row.mp4',
        poster: 'https://media.test/row.jpg',
      }) as never,
    );
    await render(<ExerciseScreen id="row" />);
    await fireEvent.press(screen.getByLabelText('The video'));
    expect(screen.getByText('Front')).toBeTruthy();

    jest.mocked(useExerciseVideo).mockReturnValue(query(undefined, { isError: true }) as never);
    await render(<ExerciseScreen id="row" />);
    expect(screen.getByText('Front')).toBeTruthy();
    expect(screen.queryByLabelText('The video')).toBeNull();
  });

  it('waits for the video before it shows anything', async () => {
    mockDetails([ROW], ['Sit down.']);
    jest.mocked(useExerciseVideo).mockReturnValue(query(undefined) as never);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByText('Front')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
  it('asks for the video again when trying again after both failed', async () => {
    jest.mocked(useExerciseDetails).mockReturnValue({
      library: query(undefined, { isError: true }),
      instructions: query(['Sit down.']),
    } as never);
    const video = query(undefined, { isError: true });
    jest.mocked(useExerciseVideo).mockReturnValue(video as never);
    await render(<ExerciseScreen id="row" />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(video.refetch).toHaveBeenCalled();
  });
  it('waits for the video asked for again, rather than showing the map first', async () => {
    mockDetails([ROW], ['Sit down.']);
    jest.mocked(useExerciseVideo).mockReturnValue({
      ...query(undefined, { isError: true }),
      isFetching: true,
    } as never);
    await render(<ExerciseScreen id="row" />);
    expect(screen.queryByText('Front')).toBeNull();
    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });
});
