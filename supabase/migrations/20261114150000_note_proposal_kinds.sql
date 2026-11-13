-- Bite's proposals to change or archive a note (#534, ADR 0133). The kinds are added in a
-- migration of their own, as a new value of an enum may be used only once it is committed:
-- 20261114150100_note_proposals.sql uses them.
alter type public.coach_proposal_kind add value 'note';
alter type public.coach_proposal_kind add value 'note_archive';
