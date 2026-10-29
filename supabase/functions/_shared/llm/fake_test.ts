import { assertEquals, assertThrows } from '@std/assert';
import { FAKE_USAGE, FakeModel } from './fake.ts';
import type { ModelRequest, StreamEvent } from './types.ts';

const request: ModelRequest = {
  task: 'coach_chat',
  messages: [{ role: 'user', parts: [{ type: 'text', text: 'Hi' }] }],
};

Deno.test('answers from its script, in order, and keeps the requests', async () => {
  const model = new FakeModel([{ type: 'text', text: 'Hello!' }], {
    parts: [],
    usage: FAKE_USAGE,
    finish: 'blocked',
  });

  assertEquals(await model.generate(request), {
    parts: [{ type: 'text', text: 'Hello!' }],
    usage: FAKE_USAGE,
    finish: 'stop',
  });
  assertEquals((await model.generate(request)).finish, 'blocked');
  assertEquals(model.requests, [request, request]);
  assertThrows(() => model.generate(request), Error, 'no turn left');
});

Deno.test('streams a turn as its parts, then done', async () => {
  const model = new FakeModel([
    { type: 'text', text: 'Logged.' },
    { type: 'toolCall', name: 'logMeal', args: { kcal: 600 } },
  ]);

  const events: StreamEvent[] = [];
  for await (const event of model.stream(request)) events.push(event);

  assertEquals(events, [
    { type: 'text', text: 'Logged.' },
    { type: 'toolCall', name: 'logMeal', args: { kcal: 600 } },
    { type: 'done', usage: FAKE_USAGE, finish: 'stop' },
  ]);
});
