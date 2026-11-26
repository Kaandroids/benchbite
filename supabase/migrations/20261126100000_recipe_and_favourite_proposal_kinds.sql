-- Bite's proposals to save a recipe and to change the favourites (ADR 0172). The kinds are added in
-- a migration of their own, as a new value of an enum may be used only once it is committed:
-- 20261126100100_recipe_and_favourite_proposals.sql uses them.
alter type public.coach_proposal_kind add value 'recipe';
alter type public.coach_proposal_kind add value 'favourites';
