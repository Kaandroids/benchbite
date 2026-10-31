import { supabase } from '@/lib/supabase';
import { pickMealPhotos } from '@/nutrition/meal-estimate';
import { act, fireEvent, render, screen, waitFor } from '@/test/render';

import { BiteScreen } from './bite-screen';
import { forgetPhotoUrls, prepareChatPhoto } from './chat-photos';
import { type ChatEvent, type ChatRequest, ChatRequestError, streamChat } from './chat-stream';
import { useThreadMessages } from './threads';

// Photos in Bite's chat (boards 7, 7b, 8 and 14): added in the composer, sent with the message,
// and read back with a saved chat.
let mockParams: { thread?: string; fresh?: string } = { thread: '', fresh: '1' };
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), rpc: jest.fn(), storage: { from: jest.fn() } },
}));
jest.mock('@/profile/display-name', () => ({ useDisplayName: () => ({ data: 'Sam' }) }));
jest.mock('@/nutrition/meal-estimate', () => ({
  ...jest.requireActual('@/nutrition/meal-estimate'),
  pickMealPhotos: jest.fn(),
}));
jest.mock('./chat-photos', () => ({
  ...jest.requireActual('./chat-photos'),
  prepareChatPhoto: jest.fn(),
}));
jest.mock('./threads', () => ({
  ...jest.requireActual('./threads'),
  useThreadMessages: jest.fn(() => ({ data: undefined })),
  useLastThread: jest.fn(() => ({ isPending: false, data: null })),
}));
jest.mock('./chat-stream', () => ({
  ...jest.requireActual('./chat-stream'),
  streamChat: jest.fn(),
}));

/** A stream the test plays: events sent with `send`, ended with `end`. */
function liveStream() {
  let onEvent: (event: ChatEvent) => void = () => {};
  let end: () => void = () => {};
  let request: Omit<ChatRequest, 'requestId'> | undefined;
  jest.mocked(streamChat).mockImplementation((req, listener) => {
    request = req;
    onEvent = listener;
    return new Promise<void>((resolve) => {
      end = resolve;
    });
  });
  return {
    send: (...events: ChatEvent[]) => act(async () => events.forEach((e) => onEvent(e))),
    end: () => act(async () => end()),
    request: () => request,
  };
}

/** Lets the user pick photos from the library, each prepared as base64 `data-<uri>`. */
function picks(...uris: string[]) {
  jest.mocked(pickMealPhotos).mockResolvedValueOnce(uris);
  jest.mocked(prepareChatPhoto).mockImplementation((uri) => Promise.resolve(`data-${uri}`));
}

/** Opens the photo sheet with the + and chooses from the library. */
async function addPhotos(button = 'Add a photo') {
  await fireEvent.press(screen.getByRole('button', { name: button }));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from library' }));
}

beforeEach(() => {
  jest.clearAllMocks();
  forgetPhotoUrls();
  mockParams = { thread: '', fresh: '1' };
  jest.mocked(useThreadMessages).mockReturnValue({ data: undefined } as never);
  jest.mocked(supabase.rpc).mockResolvedValue({
    data: { allowed: true, reason: null, resets_at: '2026-11-01T00:00:00Z' },
    error: null,
  } as never);
});

it('adds photos from the sheet, up to 3, each with an ×', async () => {
  await render(<BiteScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Add a photo' }));
  expect(
    screen.getByText('Up to 3 photos. A meal, a menu, a label: Bite looks at what you send.'),
  ).toBeOnTheScreen();

  picks('file://a.jpg', 'file://b.jpg');
  await fireEvent.press(screen.getByRole('button', { name: 'Choose from library' }));
  await waitFor(() => expect(screen.getByLabelText('Photo 2')).toBeOnTheScreen());
  expect(pickMealPhotos).toHaveBeenCalledWith('library', 3);
  expect(prepareChatPhoto).toHaveBeenCalledWith('file://a.jpg');

  // One more fits: the dashed tile asks for one at most.
  picks('file://c.jpg');
  await addPhotos('Add another photo');
  await waitFor(() => expect(screen.getByLabelText('Photo 3')).toBeOnTheScreen());
  expect(pickMealPhotos).toHaveBeenLastCalledWith('library', 1);
  expect(screen.queryByRole('button', { name: 'Add another photo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Add a photo' })).toBeDisabled();

  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 1' }));
  expect(screen.queryByLabelText('Photo 3')).toBeNull();
  expect(screen.getByRole('button', { name: 'Add another photo' })).toBeOnTheScreen();
});

it('sends photos without text, with the local time, and shows them while Bite looks', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();

  picks('file://plate.jpg');
  await addPhotos();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled());
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

  const request = stream.request()!;
  expect(request.photos).toEqual([{ mimeType: 'image/jpeg', data: 'data-file://plate.jpg' }]);
  expect(request.message).toBeUndefined();
  expect(request.localTime).toMatch(/^\d{2}:\d{2}$/);
  // The photo moves from the tray to the message, above it.
  expect(screen.queryByRole('button', { name: 'Remove photo 1' })).toBeNull();
  expect(screen.getByRole('imagebutton', { name: 'Photo 1' })).toBeOnTheScreen();
  expect(screen.getByLabelText('Looking at your photo')).toBeOnTheScreen();

  await stream.send({ event: 'text', text: 'A Margherita!' });
  await stream.send({ event: 'done', threadId: 7, messageId: 9 });
  await stream.end();
  expect(screen.getByText('A Margherita!')).toBeOnTheScreen();
});

it('sends the local time with a message of text alone', async () => {
  const stream = liveStream();
  await render(<BiteScreen />);
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Hi');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

  expect(stream.request()).toMatchObject({ message: 'Hi', localTime: expect.any(String) });
  expect(stream.request()?.photos).toBeUndefined();
});

it('hands a message whose photo was refused back to the composer, saying which', async () => {
  jest.mocked(streamChat).mockRejectedValueOnce(new ChatRequestError(422, 'photo_has_exif', 1));
  await render(<BiteScreen />);
  picks('file://a.jpg', 'file://b.jpg');
  await addPhotos();
  await waitFor(() => expect(screen.getByLabelText('Photo 2')).toBeOnTheScreen());
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Which one?');
  await fireEvent.press(screen.getByRole('button', { name: 'Send' }));

  await waitFor(() =>
    expect(
      screen.getByText(
        'Photo 2 still has data on where or when it was taken. Remove it and try another one.',
      ),
    ).toBeOnTheScreen(),
  );
  // Nothing of it stays in the chat; it waits in the composer as it was.
  expect(screen.queryByText('Not answered')).toBeNull();
  expect(screen.getByLabelText('Message')).toHaveDisplayValue('Which one?');
  expect(screen.getByRole('button', { name: 'Remove photo 2' })).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Remove photo 2' }));
  expect(screen.queryByText(/still has data/)).toBeNull();
});

it('says when a photo could not be prepared', async () => {
  jest.mocked(pickMealPhotos).mockResolvedValueOnce(['file://broken.heic']);
  jest.mocked(prepareChatPhoto).mockRejectedValueOnce(new Error('unreadable'));
  await render(<BiteScreen />);
  await addPhotos();

  await waitFor(() =>
    expect(screen.getByText("This photo couldn't be read. Try another one.")).toBeOnTheScreen(),
  );
  expect(screen.queryByLabelText('Photo 1')).toBeNull();
});

describe('a saved chat', () => {
  const createSignedUrls = jest.fn();

  beforeEach(() => {
    mockParams = { thread: '7' };
    jest.mocked(supabase.storage.from).mockReturnValue({ createSignedUrls } as never);
    createSignedUrls.mockImplementation((paths: string[]) =>
      Promise.resolve({
        data: paths.map((path) => ({ path, signedUrl: `https://media.test/${path}?token=1` })),
        error: null,
      }),
    );
    jest.mocked(useThreadMessages).mockReturnValue({
      isFetchedAfterMount: true,
      data: {
        title: null,
        messages: [
          {
            id: 'stored-1',
            role: 'user',
            text: '',
            photos: [{ path: 'u/7/a.jpg' }, { path: 'u/7/b.jpg' }],
          },
          { id: 'stored-2', role: 'bite', text: 'Two pizzas.' },
          { id: 'stored-3', role: 'user', text: 'And this?', photos: [{ path: 'u/7/c.jpg' }] },
          { id: 'stored-4', role: 'bite', text: 'A salad.' },
        ],
      },
    } as never);
  });

  it('shows its photos from coach-media, read in one batch, and opens one large', async () => {
    await render(<BiteScreen />);

    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(1));
    expect(supabase.storage.from).toHaveBeenCalledWith('coach-media');
    expect(createSignedUrls).toHaveBeenCalledWith(['u/7/a.jpg', 'u/7/b.jpg', 'u/7/c.jpg'], 3600);
    // Begun with photos alone, it is called by them.
    expect(screen.getByText('2 photos')).toBeOnTheScreen();

    const photo = screen.getAllByRole('imagebutton', { name: 'Photo 1' })[1]!;
    await waitFor(() => expect(photo).toBeEnabled());
    await fireEvent.press(photo);
    expect(screen.getByLabelText('Photo, large')).toHaveProp('source', {
      uri: 'https://media.test/u/7/c.jpg?token=1',
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Close photo' }));
    expect(screen.queryByLabelText('Photo, large')).toBeNull();
  });

  it('keeps the addresses by path, so that the chat opened again asks for none', async () => {
    const first = await render(<BiteScreen />);
    await waitFor(() => expect(createSignedUrls).toHaveBeenCalledTimes(1));
    await first.unmount();

    await render(<BiteScreen />);
    await waitFor(() =>
      expect(screen.getAllByRole('imagebutton', { name: 'Photo 1' })[1]).toBeEnabled(),
    );
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });
});
