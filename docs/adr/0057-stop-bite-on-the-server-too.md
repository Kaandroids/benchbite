# 0057. Stop Bite's answer on the server too

- **Status:** Accepted
- **Date:** 2026-10-30

## Context

The user stops Bite's answer with Stop, or by closing the chat. The app then closes the request,
and the chat function stops when it sees its stream cancelled (ADR 0052). Whether that cancel
reaches the function depends on the gateway in front of it, and it does not always (#327). A
function that never hears of it goes on asking the model, keeps an answer the user threw away,
and holds the user's one place for chat until it ends, so the next message is refused with
`call_in_progress`.

## Decision

The app names each request with a random id, `requestId`, and on a stop calls
`stop_coach_request(request_id)`, besides closing the request. The call writes a row in
`coach_stops`, which only the function may read. The function looks for its request's row before
it starts a thread, before each request to the model, and while the answer comes, at most once a
second there. Seen there, the answer ends as if its stream was cancelled: nothing is kept when
nothing came, and what came is kept as stopped. The function removes its row when the answer
ends; a user's rows older than an hour go with their next stop.

## Alternatives considered

- **Rely on the cancel alone.** Simple, but the stop is lost whenever the gateway keeps the
  connection to the function open.
- **Realtime broadcast of the stop.** The function would hear it at once, but it would keep a
  socket open for every answer, for a stop most answers never get.
- **Stop by thread.** The app does not know the thread of a first message until the answer
  begins, and a stop for a thread would also stop the user's next message in it.

## Consequences

- A stop holds whichever way it reaches the function; the place for chat is freed as the answer
  ends.
- Up to one database read a second while an answer streams, and one per round.
- A stop can come up to a second late while text streams; what came in that second is kept.
- A request without `requestId`, from an older app, is stopped only by the cancel, as before.
