import { noteResponse, onVersionRefused } from './version-refusal';

const answer = (status: number) => ({ status }) as Response;

it('tells its listeners of a response that refuses this build, and passes it on', () => {
  const listener = jest.fn();
  const stop = onVersionRefused(listener);
  const refusal = answer(426);
  expect(noteResponse(refusal)).toBe(refusal);
  expect(listener).toHaveBeenCalledTimes(1);

  stop();
  noteResponse(answer(426));
  expect(listener).toHaveBeenCalledTimes(1);
});

it('says nothing of any other response', () => {
  const listener = jest.fn();
  const stop = onVersionRefused(listener);
  [200, 400, 401, 500].forEach((status) => noteResponse(answer(status)));
  expect(listener).not.toHaveBeenCalled();
  stop();
});
