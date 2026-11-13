-- Bite's proposals to change or archive a note (ADR 0133): made only for a note of the user's in
-- use, applied only while it is as the proposal saw it, and undone to it.
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com');

create function pg_temp.sign_in(user_id uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
    set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
-- Its helpers are called as the signed-in user, while new functions are closed to clients
-- (#529, ADR 0126): only they are opened, and go with the test's session.
grant execute on all functions in schema pg_temp to public;

create temporary table ids (name text primary key, id bigint) on commit drop;
grant select, insert on ids to authenticated;

insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000a');
insert into ids select 'thread', max(id) from public.coach_threads;
insert into public.coach_threads (user_id) values ('00000000-0000-0000-0000-00000000000b');
insert into ids select 'b thread', max(id) from public.coach_threads;

insert into public.coach_notes (user_id, category, text, review_on) values
  ('00000000-0000-0000-0000-00000000000a', 'injury', 'Left knee hurts on squats', current_date + 7);
insert into ids select 'knee', max(id) from public.coach_notes;
insert into public.coach_notes (user_id, category, text, asked) values
  ('00000000-0000-0000-0000-00000000000a', 'food', 'Avoids pork', true);
insert into ids select 'asked', max(id) from public.coach_notes;
insert into public.coach_notes (user_id, category, text, archived_at, archive_reason) values
  ('00000000-0000-0000-0000-00000000000a', 'goal', 'Run 5 km', now(), 'Done');
insert into ids select 'past', max(id) from public.coach_notes;
insert into public.coach_notes (user_id, category, text) values
  ('00000000-0000-0000-0000-00000000000b', 'allergy', 'Allergic to nuts');
insert into ids select 'b note', max(id) from public.coach_notes;

create function pg_temp.id(key text) returns bigint language sql as $$
  select id from ids where name = key;
$$;
create function pg_temp.propose(kind public.coach_proposal_kind, change jsonb) returns bigint
language sql as $$
  select public.propose_coach_change(pg_temp.id('thread'), kind, change, current_date);
$$;
create function pg_temp.decide(proposal bigint, decision public.coach_proposal_decision)
returns public.coach_proposal_status language sql as $$
  select public.decide_coach_proposal(proposal, decision, current_date);
$$;
create function pg_temp.knee() returns jsonb language sql as $$
  select jsonb_build_object(
    'category', n.category, 'text', n.text, 'reviewOn', n.review_on,
    'archived', n.archived_at is not null, 'reason', n.archive_reason
  )
  from public.coach_notes n where n.id = pg_temp.id('knee');
$$;
grant execute on all functions in schema pg_temp to public;

select pg_temp.sign_in('00000000-0000-0000-0000-00000000000a');

-- Proposing changes nothing, and keeps only what a note's proposal may change.
insert into ids select 'change', pg_temp.propose(
  'note',
  jsonb_build_object(
    'id', pg_temp.id('knee'), 'text', 'Left knee is a little sore on deep squats',
    'reviewOn', current_date + 21, 'userId', '00000000-0000-0000-0000-00000000000b'
  )
);
select is(
  pg_temp.knee() ->> 'text', 'Left knee hurts on squats', 'proposing leaves the note as it is'
);
select is(
  (select change from public.coach_proposals where id = pg_temp.id('change')),
  jsonb_build_object(
    'id', pg_temp.id('knee'), 'text', 'Left knee is a little sore on deep squats',
    'reviewOn', current_date + 21
  ),
  'the change keeps only the fields a note may change'
);
select is(
  (select before from public.coach_proposals where id = pg_temp.id('change')),
  jsonb_build_object(
    'id', pg_temp.id('knee'), 'category', 'injury', 'text', 'Left knee hurts on squats',
    'reviewOn', current_date + 7, 'archived', false
  ),
  'the proposal keeps the note as it was'
);

-- Only for a note of the user's in use.
select throws_ok(
  format($$select pg_temp.propose('note', '{"id": %s, "text": "x"}')$$, pg_temp.id('b note')),
  'P0002', 'Note not found', 'no one else''s note'
);
select throws_ok(
  format($$select pg_temp.propose('note', '{"id": %s, "text": "x"}')$$, pg_temp.id('asked')),
  'P0002', 'Note not found', 'not one waiting for the user''s yes'
);
select throws_ok(
  format($$select pg_temp.propose('note_archive', '{"id": %s, "reason": "x"}')$$, pg_temp.id('past')),
  'P0002', 'Note not found', 'not one archived already'
);
select throws_ok(
  format($$select pg_temp.propose('note', '{"id": %s}')$$, pg_temp.id('knee')),
  '22023', null, 'a change names what to change'
);
select throws_ok(
  format($$select pg_temp.propose('note_archive', '{"id": %s}')$$, pg_temp.id('knee')),
  '22023', null, 'archiving names why'
);
select throws_ok(
  format($$select pg_temp.propose('note', '{"id": %s, "text": "%s"}')$$, pg_temp.id('knee'), repeat('x', 201)),
  '23514', null, 'the notebook''s own checks refuse a text too long'
);
select is(
  pg_temp.knee() ->> 'text', 'Left knee hurts on squats', 'a refused proposal changes nothing'
);

-- Applied, and undone to what was there.
select is(pg_temp.decide(pg_temp.id('change'), 'apply'), 'applied', 'the user applies it');
select is(
  pg_temp.knee(),
  jsonb_build_object(
    'category', 'injury', 'text', 'Left knee is a little sore on deep squats',
    'reviewOn', current_date + 21, 'archived', false, 'reason', null
  ),
  'applying changes what it names only'
);
select is(pg_temp.decide(pg_temp.id('change'), 'undo'), 'undone', 'the user undoes it');
select is(
  pg_temp.knee(),
  jsonb_build_object(
    'category', 'injury', 'text', 'Left knee hurts on squats',
    'reviewOn', current_date + 7, 'archived', false, 'reason', null
  ),
  'undoing puts the note back as it was'
);

-- A day to ask again given as null clears it.
insert into ids select 'clear', pg_temp.propose(
  'note', jsonb_build_object('id', pg_temp.id('knee'), 'reviewOn', null)
);
select pg_temp.decide(pg_temp.id('clear'), 'apply');
select is(pg_temp.knee() ->> 'reviewOn', null, 'a null day clears the day to ask again');
select pg_temp.decide(pg_temp.id('clear'), 'undo');

-- Not over a change the user made since.
insert into ids select 'stale', pg_temp.propose(
  'note', jsonb_build_object('id', pg_temp.id('knee'), 'category', 'health')
);
update public.coach_notes set text = 'Left knee hurts on lunges' where id = pg_temp.id('knee');
select throws_ok(
  format($$select pg_temp.decide(%s, 'apply')$$, pg_temp.id('stale')),
  'BB035', null, 'a note changed since is not changed again'
);
update public.coach_notes set text = 'Left knee hurts on squats' where id = pg_temp.id('knee');
select pg_temp.decide(pg_temp.id('stale'), 'keep');

-- Archived with why, and back in use on undo.
insert into ids select 'archive', pg_temp.propose(
  'note_archive', jsonb_build_object('id', pg_temp.id('knee'), 'reason', 'The knee is fine again')
);
select is(pg_temp.knee() ->> 'archived', 'false', 'proposing to archive leaves the note in use');
select is(pg_temp.decide(pg_temp.id('archive'), 'apply'), 'applied', 'the user archives it');
select is(
  pg_temp.knee() - 'reviewOn',
  jsonb_build_object(
    'category', 'injury', 'text', 'Left knee hurts on squats', 'archived', true,
    'reason', 'The knee is fine again'
  ),
  'it is a past note, with why'
);
select is(pg_temp.decide(pg_temp.id('archive'), 'undo'), 'undone', 'the user undoes archiving');
select is(
  pg_temp.knee() - 'reviewOn',
  jsonb_build_object(
    'category', 'injury', 'text', 'Left knee hurts on squats', 'archived', false, 'reason', null
  ),
  'undoing puts it back in use'
);

-- A newer proposal for the same note replaces one pending; one for another note stays.
insert into ids select 'first', pg_temp.propose(
  'note', jsonb_build_object('id', pg_temp.id('knee'), 'text', 'Knee a little sore')
);
insert into ids select 'second', pg_temp.propose(
  'note_archive', jsonb_build_object('id', pg_temp.id('knee'), 'reason', 'Healed')
);
select is(
  (select status from public.coach_proposals where id = pg_temp.id('first')), 'replaced',
  'a newer proposal for the note replaces the one before'
);
select is(
  (select status from public.coach_proposals where id = pg_temp.id('second')), 'pending',
  'the newer one waits for the user'
);

-- Clients still change notes only as the notebook does, and proposals only through the functions.
select throws_ok(
  $$update public.coach_proposals set status = 'applied'$$,
  '42501', null, 'the user may not mark a proposal applied'
);

-- No one else decides it, nor changes the note through it.
select pg_temp.sign_in('00000000-0000-0000-0000-00000000000b');
select throws_ok(
  format($$select pg_temp.decide(%s, 'apply')$$, pg_temp.id('second')),
  'P0002', 'Proposal not found', 'another user cannot apply it'
);
select throws_ok(
  format(
    $$select public.propose_coach_change(%s, 'note_archive', '{"id": %s, "reason": "x"}', current_date)$$,
    pg_temp.id('b thread'), pg_temp.id('knee')
  ),
  'P0002', 'Note not found', 'another user cannot propose to archive it'
);
reset role;
select is(
  (select archived_at is null from public.coach_notes where id = pg_temp.id('knee')), true,
  'the note stays in use'
);

select * from finish();
rollback;
