import { router } from 'expo-router';

import { act, fireEvent, render, screen } from '@/test/render';

import { ChatsScreen } from './chats-screen';
import { useDeleteThread, useRenameThread, useThreads, type ThreadSummary } from './threads';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('./threads', () => ({
  ...jest.requireActual('./threads'),
  useThreads: jest.fn(),
  useDeleteThread: jest.fn(),
  useRenameThread: jest.fn(),
}));

const THREADS: ThreadSummary[] = [
  {
    id: 2,
    title: 'Lunch ideas',
    lastMessageAt: new Date(2026, 9, 30, 12, 40),
    lastMessage: 'A chicken rice bowl.',
    expression: 'happy',
  },
  {
    id: 1,
    title: 'Knee pain on squats',
    lastMessageAt: new Date(2026, 9, 29, 18, 20),
    lastMessage: 'Try leg press today.',
    expression: 'neutral',
  },
];

const deleteThread = jest.fn();
const renameThread = jest.fn();

function threads(data: ThreadSummary[]) {
  jest.mocked(useThreads).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: false,
    refetch: jest.fn(),
  } as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 9, 30, 15), doNotFake: ['nextTick'] });
  threads(THREADS);
  jest.mocked(useDeleteThread).mockReturnValue({ mutate: deleteThread, isError: false } as never);
  jest.mocked(useRenameThread).mockReturnValue({ mutate: renameThread, isPending: false } as never);
});
afterEach(() => jest.useRealTimers());

it('lists the chats by day, with their last message', async () => {
  await render(<ChatsScreen />);
  expect(screen.getByText('Today')).toBeTruthy();
  expect(screen.getByText('Yesterday')).toBeTruthy();
  expect(screen.getByText('Lunch ideas')).toBeTruthy();
  expect(screen.getByText('Try leg press today.')).toBeTruthy();
});

it('opens a chat over the chats, or a new one in place of the chat under them', async () => {
  await render(<ChatsScreen />);
  await fireEvent.press(screen.getByText('Lunch ideas'));
  expect(router.push).toHaveBeenCalledWith({
    pathname: '/bite',
    params: { thread: '2', fresh: '', offer: '', from: 'chats' },
  });
  await fireEvent.press(screen.getByRole('button', { name: 'New chat' }));
  expect(router.dismissTo).toHaveBeenLastCalledWith({
    pathname: '/bite',
    params: { thread: '', fresh: expect.stringMatching(/^\d+$/), offer: '' },
  });
});

it('deletes a chat once its Undo has gone, and not when it is undone', async () => {
  await render(<ChatsScreen />);
  await fireEvent(screen.getByText('Lunch ideas'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.queryByText('Lunch ideas')).toBeNull();
  expect(screen.getByText('Chat deleted')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(deleteThread).not.toHaveBeenCalled();
  expect(screen.getByText('Lunch ideas')).toBeTruthy();

  await fireEvent(screen.getByText('Knee pain on squats'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  await act(() => jest.advanceTimersByTime(5000));
  expect(deleteThread).toHaveBeenCalledWith(1);
});

it('deletes a chat whose Undo still shows when the screen closes', async () => {
  const { unmount } = await render(<ChatsScreen />);
  await fireEvent(screen.getByText('Lunch ideas'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Delete' }));
  expect(deleteThread).not.toHaveBeenCalled();
  await act(() => unmount());
  expect(deleteThread).toHaveBeenCalledWith(2);
});

it('searches once typing rests, keeping the field and the list meanwhile', async () => {
  await render(<ChatsScreen />);
  await fireEvent.changeText(screen.getByLabelText('Search chats'), 'kne');
  expect(useThreads).toHaveBeenLastCalledWith('');
  await act(() => jest.advanceTimersByTime(250));
  expect(useThreads).toHaveBeenLastCalledWith('kne');
  expect(screen.getByLabelText('Search chats')).toBeTruthy();
});

it('renames a chat', async () => {
  await render(<ChatsScreen />);
  await fireEvent(screen.getByText('Knee pain on squats'), 'longPress');
  await fireEvent.press(screen.getByRole('button', { name: 'Rename' }));
  await act(() => jest.advanceTimersByTime(500));
  await fireEvent.changeText(screen.getByLabelText('Name'), 'Knee');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(renameThread).toHaveBeenCalledWith({ id: 1, title: 'Knee' }, expect.anything());
});

it('says when there is no chat yet, and starts one', async () => {
  threads([]);
  await render(<ChatsScreen />);
  expect(screen.getByText('No chats yet')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Start a chat' }));
  expect(router.dismissTo).toHaveBeenCalled();
});
