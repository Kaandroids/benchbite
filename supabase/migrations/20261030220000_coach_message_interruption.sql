-- How Bite's answer ended, kept with it (#343, ADR 0052): a chat read back shows an answer that
-- stopped short as it showed while it came, and not as one that ended there.

-- Why an answer stopped before its end, as the chat function tells the app: its request failed or
-- was refused, the user stopped it, or the model cut it, as at the token limit.
create type public.coach_interruption as enum ('failed', 'refused', 'stopped', 'cut');

-- Null for a whole answer, and for the user's messages.
alter table public.coach_messages
  add column interrupted public.coach_interruption,
  add constraint coach_messages_interrupted_check check (role = 'bite' or interrupted is null);
