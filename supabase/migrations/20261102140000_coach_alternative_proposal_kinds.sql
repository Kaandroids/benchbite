-- The kinds of proposal Bite makes for alternatives (#397, ADR 0075): changes to several workouts
-- at once, a new alternative of a workout put in use, and a switch to another alternative. Added
-- apart from the functions that use them, as a new value of an enum can be used only once it is
-- committed.
alter type public.coach_proposal_kind add value 'workouts';
alter type public.coach_proposal_kind add value 'alternative';
alter type public.coach_proposal_kind add value 'alternative_switch';
