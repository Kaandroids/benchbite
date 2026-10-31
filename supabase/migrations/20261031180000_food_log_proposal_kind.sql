-- Bite's proposals to change the food log (#299, ADR 0067). The kind is added in a migration of its
-- own, as a new value of an enum may be used only once it is committed:
-- 20261031180100_food_log_proposals.sql uses it.
alter type public.coach_proposal_kind add value 'food_log';
