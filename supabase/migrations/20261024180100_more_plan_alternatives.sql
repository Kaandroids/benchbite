-- More exercises for the plan builder to choose from, most of them for training without
-- equipment, where several slots had only one exercise or none (codebase review, B16). A
-- session with time left takes another exercise of a slot, so a slot needs more than one
-- candidate for that.
insert into public.plan_slot_exercises (slot, exercise_id, requires, min_experience, priority)
values
  ('squat', 'Freehand_Jump_Squat', 'bodyweight', 'intermediate', 8),
  ('hinge', 'Glute_Kickback', 'bodyweight', 'beginner', 8),
  ('horizontal_push', 'Push-Up_Wide', 'bodyweight', 'beginner', 7),
  ('incline_push', 'Push-Ups_With_Feet_Elevated', 'bodyweight', 'beginner', 6),
  ('vertical_push', 'Handstand_Push-Ups', 'bodyweight', 'advanced', 5),
  ('triceps', 'Body_Tricep_Press', 'bodyweight', 'beginner', 8),
  ('triceps', 'Incline_Push-Up_Close-Grip', 'bodyweight', 'beginner', 9);
