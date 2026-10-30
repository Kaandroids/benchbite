-- A meal photo's answer may be 3,000 tokens, reasoning included (#299, ADR 0059): 1,024 cut off an
-- estimate of more than about seven items, which then failed and was billed all the same. A call
-- sets this much aside from the budget until it is recorded (ADR 0056), about $0.011 at today's
-- price; it is billed only what it used.
update public.ai_feature_limits set max_output_tokens = 3000 where feature = 'meal_photo';
