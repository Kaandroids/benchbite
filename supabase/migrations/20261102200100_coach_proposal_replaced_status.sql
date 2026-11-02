-- A proposal a newer one of the same thread replaced before it was decided (#402, ADR 0077). In a
-- migration of its own, as a new enum value cannot be used in the transaction that adds it.
alter type public.coach_proposal_status add value 'replaced';
